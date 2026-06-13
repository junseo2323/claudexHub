import { nanoid } from "nanoid";
import type { DB } from "../db/connection.js";
import type { User } from "./users.js";

export interface Team {
  id: string;
  slug: string;
  name: string;
  ownerId: string;
  createdAt: string;
}

export type TeamRole = "owner" | "member";
export interface TeamMember extends User {
  role: TeamRole;
}

interface TeamRow {
  id: string;
  slug: string;
  name: string;
  owner_id: string;
  created_at: string;
}

function rowToTeam(row: TeamRow): Team {
  return { id: row.id, slug: row.slug, name: row.name, ownerId: row.owner_id, createdAt: row.created_at };
}

/** kebab-case slug from a team name. */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "team"
  );
}

export class TeamRepository {
  constructor(private readonly db: DB) {}

  getById(id: string): Team | undefined {
    const row = this.db.prepare("SELECT * FROM teams WHERE id = ?").get(id) as TeamRow | undefined;
    return row ? rowToTeam(row) : undefined;
  }

  getBySlug(slug: string): Team | undefined {
    const row = this.db.prepare("SELECT * FROM teams WHERE slug = ?").get(slug) as TeamRow | undefined;
    return row ? rowToTeam(row) : undefined;
  }

  /** Create a team owned by `ownerId`; the owner is added as a member. */
  createTeam(name: string, ownerId: string): Team {
    const base = slugify(name);
    let slug = base;
    for (let i = 2; this.getBySlug(slug); i++) slug = `${base}-${i}`;

    const team: Team = {
      id: `team_${nanoid(12)}`,
      slug,
      name: name.trim() || slug,
      ownerId,
      createdAt: new Date().toISOString(),
    };
    const tx = this.db.transaction(() => {
      this.db
        .prepare("INSERT INTO teams (id, slug, name, owner_id, created_at) VALUES (@id,@slug,@name,@ownerId,@createdAt)")
        .run(team);
      this.addMember(team.id, ownerId, "owner");
    });
    tx();
    return team;
  }

  addMember(teamId: string, userId: string, role: TeamRole = "member"): void {
    this.db
      .prepare(
        `INSERT INTO team_members (team_id, user_id, role, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(team_id, user_id) DO UPDATE SET role = excluded.role`,
      )
      .run(teamId, userId, role, new Date().toISOString());
  }

  removeMember(teamId: string, userId: string): void {
    this.db.prepare("DELETE FROM team_members WHERE team_id = ? AND user_id = ?").run(teamId, userId);
  }

  isMember(teamId: string, userId: string): boolean {
    return !!this.db
      .prepare("SELECT 1 FROM team_members WHERE team_id = ? AND user_id = ?")
      .get(teamId, userId);
  }

  roleOf(teamId: string, userId: string): TeamRole | undefined {
    const row = this.db
      .prepare("SELECT role FROM team_members WHERE team_id = ? AND user_id = ?")
      .get(teamId, userId) as { role: TeamRole } | undefined;
    return row?.role;
  }

  listMembers(teamId: string): TeamMember[] {
    const rows = this.db
      .prepare(
        `SELECT u.*, tm.role AS member_role
         FROM team_members tm JOIN users u ON u.id = tm.user_id
         WHERE tm.team_id = ?
         ORDER BY (tm.role = 'owner') DESC, tm.created_at ASC`,
      )
      .all(teamId) as (Record<string, unknown> & { member_role: TeamRole })[];
    return rows.map((r) => ({
      id: r.id as string,
      githubId: (r.github_id as string | null) ?? undefined,
      login: r.login as string,
      name: (r.name as string | null) ?? undefined,
      avatarUrl: (r.avatar_url as string | null) ?? undefined,
      createdAt: r.created_at as string,
      role: r.member_role,
    }));
  }

  listTeamsForUser(userId: string): Team[] {
    const rows = this.db
      .prepare(
        `SELECT t.* FROM team_members tm JOIN teams t ON t.id = tm.team_id
         WHERE tm.user_id = ? ORDER BY t.created_at ASC`,
      )
      .all(userId) as TeamRow[];
    return rows.map(rowToTeam);
  }

  /** Share a card with a team (one team per card). */
  setCardTeam(cardId: string, teamId: string): void {
    this.db
      .prepare(
        `INSERT INTO card_teams (card_id, team_id, created_at) VALUES (?, ?, ?)
         ON CONFLICT(card_id) DO UPDATE SET team_id = excluded.team_id`,
      )
      .run(cardId, teamId, new Date().toISOString());
  }

  getCardTeamId(cardId: string): string | undefined {
    const row = this.db.prepare("SELECT team_id FROM card_teams WHERE card_id = ?").get(cardId) as
      | { team_id: string }
      | undefined;
    return row?.team_id;
  }
}
