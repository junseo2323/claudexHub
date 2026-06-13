import type { CardInput } from "../domain/card-schema.js";

/**
 * Seed cards for the Phase 1 prototype, drawn from the spec's initial category
 * list (Korean/Asia OAuth + deploy niche). All published so search returns them.
 * The `seedId` lets `seed.ts` upsert idempotently.
 */
export interface SeedCard extends CardInput {
  seedId: string;
}

export const SEED_CARDS: SeedCard[] = [
  {
    seedId: "seed_nextjs_spring_oauth_redirect_loop",
    title: "Next.js + Spring Security OAuth2 callback redirect loop",
    problem:
      "After Spring Security OAuth2 login the browser bounces between /login and the callback URL endlessly; the session is never established on the Next.js app.",
    environment: { frontend: "Next.js 15", backend: "Spring Boot 3", deploy: "CloudFront + API subdomain" },
    symptoms: [
      "Infinite redirect between frontend and /login/oauth2/code",
      "JSESSIONID set on the API domain but never sent back",
      "Network shows 302 loop",
    ],
    likelyCauses: [
      "Session cookie on API subdomain not shared with frontend origin",
      "SameSite=Lax blocks cross-site cookie on redirect",
      "Spring success handler redirects to a protected route",
    ],
    failedAttempts: ["Disabling CSRF only", "Changing redirect URI without fixing cookie domain"],
    verifiedFix: [
      "Issue the session/JWT as a cookie with SameSite=None; Secure on a shared parent domain",
      "Configure Spring authenticationSuccessHandler to redirect to a public frontend URL",
      "Set CORS allowedOrigins to the exact frontend origin with allowCredentials=true",
    ],
    verification: ["Login completes once with no loop", "/api/me returns the authenticated user"],
    agentHint:
      "Before touching security config, inspect whether the session cookie is actually returned on the frontend origin (SameSite/domain), not just set on the API domain.",
    sourceLinks: ["https://docs.spring.io/spring-security/reference/servlet/oauth2/login/index.html"],
    visibility: "public",
    status: "published",
  },
  {
    seedId: "seed_nextjs_nest_oauth_state_mismatch",
    title: "Next.js + NestJS OAuth callback state mismatch",
    problem:
      "NestJS passport OAuth callback fails with 'Unable to verify authorization request state' intermittently after deploy behind a load balancer.",
    environment: { frontend: "Next.js 15", backend: "NestJS 10", deploy: "ECS behind ALB" },
    symptoms: ["InternalOAuthError: state mismatch", "Works locally, fails in prod", "Sticky between two instances"],
    likelyCauses: [
      "OAuth state stored in in-memory session, lost across instances",
      "No shared session store behind the load balancer",
    ],
    failedAttempts: ["Retrying login", "Increasing session TTL"],
    verifiedFix: [
      "Use a shared session store (Redis) for passport OAuth state",
      "Enable sticky sessions on the ALB target group as a stopgap",
    ],
    verification: ["Repeated logins succeed across both instances"],
    agentHint: "State mismatch in multi-instance deploys almost always means the OAuth state isn't in a shared store.",
    sourceLinks: [],
    visibility: "public",
    status: "published",
  },
  {
    seedId: "seed_httponly_cookie_not_sent_crosssite",
    title: "HttpOnly cookie not sent on cross-site requests in production",
    problem:
      "Auth cookie is set after login but never sent on subsequent fetch() calls from the frontend to the API in production, so every request is unauthenticated.",
    environment: { frontend: "Next.js 15", backend: "NestJS / Spring", deploy: "frontend and API on different domains", browser: "Chrome, Safari" },
    symptoms: [
      "Set-Cookie visible in the login response",
      "Cookie not attached to later requests",
      "/me returns 401",
    ],
    likelyCauses: [
      "fetch missing credentials: 'include'",
      "Cookie lacks SameSite=None; Secure for cross-site",
      "CORS missing Access-Control-Allow-Credentials",
    ],
    failedAttempts: ["Reading the HttpOnly cookie from JS", "Putting the token in a query param"],
    verifiedFix: [
      "Add credentials: 'include' to all fetch calls",
      "Set cookie: HttpOnly; Secure; SameSite=None; Path=/",
      "CORS: exact origin + Access-Control-Allow-Credentials: true (no wildcard)",
    ],
    verification: ["Cookie appears in Application > Cookies", "/me authenticates", "Verified separately on Safari"],
    agentHint:
      "Before editing auth logic, check Set-Cookie attributes, CORS credentials headers, and the request credentials mode first.",
    sourceLinks: ["https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Set-Cookie"],
    visibility: "public",
    status: "published",
  },
  {
    seedId: "seed_cloudfront_s3_spa_403_refresh",
    title: "CloudFront + S3 SPA returns 403/AccessDenied on route refresh",
    problem:
      "A single-page app deployed to S3 behind CloudFront works on the home page but returns 403 AccessDenied when refreshing a client-side route like /dashboard.",
    environment: { frontend: "Next.js static export / Vite SPA", deploy: "CloudFront + S3 (OAC)" },
    symptoms: ["403 on deep-link refresh", "Home route works", "S3 has no object for the sub-path"],
    likelyCauses: [
      "S3 returns 403 for missing keys (with OAC), not 404",
      "No custom error response mapping to index.html",
    ],
    failedAttempts: ["Making the bucket public", "Adding 404 -> index.html only"],
    verifiedFix: [
      "Add a CloudFront custom error response: 403 -> /index.html with 200",
      "Also map 404 -> /index.html for non-OAC setups",
      "Keep the bucket private and use Origin Access Control",
    ],
    verification: ["Refreshing /dashboard loads the SPA", "Bucket stays private"],
    agentHint: "With OAC, S3 returns 403 (not 404) for missing keys, so map the 403 error response to index.html.",
    sourceLinks: [],
    visibility: "public",
    status: "published",
  },
  {
    seedId: "seed_cors_credentials_wildcard",
    title: "CORS with credentials rejected when origin is wildcard",
    problem:
      "Browser blocks the response with 'Access-Control-Allow-Origin: * is not allowed when credentials mode is include'.",
    environment: { frontend: "Next.js 15", backend: "NestJS / Express" },
    symptoms: ["CORS error in console despite server sending headers", "Preflight OK but actual request blocked"],
    likelyCauses: ["Wildcard origin with credentials", "Allow-Credentials header missing"],
    failedAttempts: ["Setting Access-Control-Allow-Origin: *", "Disabling credentials"],
    verifiedFix: [
      "Reflect the exact request origin instead of '*'",
      "Set Access-Control-Allow-Credentials: true",
      "Whitelist allowed origins explicitly",
    ],
    verification: ["Credentialed fetch succeeds", "Cookie sent and received"],
    agentHint: "Credentialed CORS cannot use a wildcard origin — reflect the specific origin.",
    sourceLinks: ["https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS"],
    visibility: "public",
    status: "published",
  },
  {
    seedId: "seed_jwt_cookie_vs_header_mismatch",
    title: "JWT in HttpOnly cookie vs Authorization header mismatch",
    problem:
      "Backend expects the JWT in an Authorization: Bearer header, but the frontend stores it in an HttpOnly cookie it can't read, so all requests are unauthorized.",
    environment: { frontend: "Next.js 15", backend: "NestJS passport-jwt" },
    symptoms: ["401 on every API call", "Token present in cookie", "Guard never sees the token"],
    likelyCauses: ["JwtStrategy extracts from header, token is in cookie", "Frontend can't read HttpOnly cookie to set header"],
    failedAttempts: ["Trying to read the HttpOnly cookie in JS"],
    verifiedFix: [
      "Configure passport-jwt to extract the token from the cookie",
      "Or set the token in a readable cookie and forward it as a header (less secure)",
      "Keep one consistent transport for the token",
    ],
    verification: ["Authenticated requests pass the guard"],
    agentHint: "Pick one JWT transport (cookie or header) and make the extractor match it.",
    sourceLinks: [],
    visibility: "public",
    status: "published",
  },
  {
    seedId: "seed_cloudfront_stale_index_html",
    title: "CloudFront serves stale index.html after deploy",
    problem:
      "After deploying a new build, users keep getting the old app because CloudFront caches index.html and references hashed assets that no longer exist (blank page).",
    environment: { frontend: "Vite / Next static", deploy: "CloudFront + S3" },
    symptoms: ["Old app after deploy", "Blank page until hard refresh", "404 on old hashed JS"],
    likelyCauses: ["index.html cached at the edge", "No invalidation on deploy"],
    failedAttempts: ["Waiting for TTL to expire"],
    verifiedFix: [
      "Set Cache-Control: no-cache on index.html, long max-age on hashed assets",
      "Run a CloudFront invalidation for /index.html (or /*) on each deploy",
    ],
    verification: ["New deploy is visible immediately without hard refresh"],
    agentHint: "Cache hashed assets forever but never cache index.html; invalidate it on deploy.",
    sourceLinks: [],
    visibility: "public",
    status: "published",
  },
  {
    seedId: "seed_spring_cors_preflight_401",
    title: "Spring Boot CORS preflight returns 401 due to security filter order",
    problem:
      "OPTIONS preflight requests are rejected with 401 because Spring Security runs before CORS handling, so the browser blocks the real request.",
    environment: { backend: "Spring Boot 3 + Spring Security" },
    symptoms: ["OPTIONS returns 401", "GET/POST never reached", "CORS error in browser"],
    likelyCauses: ["Security filter intercepts preflight", "CORS not registered with Spring Security"],
    failedAttempts: ["Adding @CrossOrigin on controllers only"],
    verifiedFix: [
      "Register a CorsConfigurationSource bean and call http.cors(...) in the security chain",
      "Permit OPTIONS requests in the security config",
    ],
    verification: ["Preflight returns 200", "Subsequent request authenticates"],
    agentHint: "In Spring Security, wire CORS into the security filter chain; controller-level @CrossOrigin is not enough.",
    sourceLinks: [],
    visibility: "public",
    status: "published",
  },
  {
    seedId: "seed_kakao_login_redirect_uri_mismatch",
    title: "Kakao login fails with redirect_uri mismatch (KOE006)",
    problem:
      "Kakao OAuth login returns KOE006 redirect_uri mismatch in production even though it works locally.",
    environment: { frontend: "Next.js 15", backend: "NestJS", deploy: "Vercel / CloudFront" },
    symptoms: ["KOE006 error page", "Works on localhost", "Fails on the deployed domain"],
    likelyCauses: [
      "Production redirect URI not registered in Kakao developer console",
      "Trailing slash or http vs https mismatch",
    ],
    failedAttempts: ["Re-issuing the REST API key"],
    verifiedFix: [
      "Register the exact production redirect URI (scheme, host, path) in the Kakao console",
      "Ensure the URI sent matches byte-for-byte, including https and no trailing slash",
    ],
    verification: ["Kakao login succeeds in production"],
    agentHint: "redirect_uri mismatches are exact-string problems: compare the sent URI against the registered one character by character.",
    sourceLinks: ["https://developers.kakao.com/docs/latest/en/kakaologin/common"],
    visibility: "public",
    status: "published",
  },
  {
    seedId: "seed_env_var_not_available_runtime",
    title: "Env var not available at runtime (build-time inlining)",
    problem:
      "A NEXT_PUBLIC_/VITE_ environment variable is undefined in the browser at runtime because it was not present at build time and these vars are inlined during build.",
    environment: { frontend: "Next.js 15 / Vite", deploy: "Docker / CI build" },
    symptoms: ["process.env.X is undefined in the browser", "Works in dev, fails in built image"],
    likelyCauses: ["Public env vars are inlined at build time", "Var set only at container runtime, not build"],
    failedAttempts: ["Setting the var only in the runtime environment"],
    verifiedFix: [
      "Pass the variable as a build arg / build-time env so it is inlined",
      "For true runtime config, fetch it from a server endpoint instead of NEXT_PUBLIC_",
    ],
    verification: ["The value is present in the production browser bundle"],
    agentHint: "Public (NEXT_PUBLIC_/VITE_) vars are baked in at build time; set them during build, not just at runtime.",
    sourceLinks: [],
    visibility: "public",
    status: "published",
  },
];
