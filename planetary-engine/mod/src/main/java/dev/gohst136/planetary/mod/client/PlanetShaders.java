package dev.gohst136.planetary.mod.client;

import org.lwjgl.opengl.GL20;

/** GLSL 1.50 (core) program for patch rendering: geomorph, camera-relative offset, log depth, height colouring. */
final class PlanetShaders {
    private PlanetShaders() {}

    static final String VERTEX = """
            #version 150
            in vec3 aPos;
            in vec3 aMorph;
            in vec4 aColor;
            uniform mat4 uProj;
            uniform mat4 uView;       // rotation only (camera sits at the origin)
            uniform vec3 uOffset;     // patch origin - camera, computed in double on the CPU
            uniform float uMorph;     // 0 = own grid, 1 = parent grid
            uniform float uFarLog;    // log2(far + 1)
            uniform vec3 uOriginMod;  // patch origin modulo 1024 m (double on CPU) so the 1 m grid stays precise
            out vec3 vLocal;
            out vec3 vRel;
            out vec4 vColor;
            void main() {
                vec3 rel = uOffset + mix(aPos, aMorph, uMorph);
                vRel = rel;
                vLocal = mix(aPos, aMorph, uMorph) + uOriginMod;
                vColor = aColor;
                vec4 c = uProj * uView * vec4(rel, 1.0);
                c.z = (2.0 * log2(max(1e-6, 1.0 + c.w)) / uFarLog - 1.0) * c.w;
                gl_Position = c;
            }
            """;

    static final String FRAGMENT = """
            #version 150
            in vec3 vRel;
            in vec3 vLocal;
            in vec4 vColor;
            uniform vec3 uSun;        // unit vector towards the sun (planet frame == world axes)
            uniform int uDebug;       // 0 normal, 1 colour by LOD level, 2 level colours + wireframe (done on the CPU side)
            uniform float uLevel;
            uniform vec3 uCamPos;     // camera position in planet frame (float is fine for a direction)
            out vec4 fragColor;
            void main() {
                vec3 col = vColor.rgb;
                float water = vColor.a;
                vec3 up = normalize(uCamPos + vRel);
                vec3 n = normalize(cross(dFdx(vRel), dFdy(vRel)));
                if (dot(n, up) < 0.0) n = -n;
                // faceted normals are only meaningful (and float-precise) close to the camera
                float w = 1.0 - smoothstep(2.0e3, 3.0e4, length(vRel));
                n = normalize(mix(up, n, w));
                // scale reference: 1 m and 16 m lattice drawn on the two axes most parallel to the surface
                // (a full 3D lattice cuts near-flat ground at grazing angles and smears into huge bands)
                vec3 ua = abs(up);
                vec2 g = (ua.y >= ua.x && ua.y >= ua.z) ? vLocal.xz : ((ua.x >= ua.z) ? vLocal.yz : vLocal.xy);
                vec2 fw = fwidth(g);
                float fp = max(fw.x, fw.y);
                vec2 f1 = abs(fract(g) - 0.5);
                float l1 = (1.0 - smoothstep(0.0, 0.04 + fp, 0.5 - max(f1.x, f1.y))) * (1.0 - smoothstep(0.25, 0.6, fp));
                vec2 g16 = g / 16.0;
                vec2 f16 = abs(fract(g16) - 0.5);
                float l16 = (1.0 - smoothstep(0.0, 0.03 + fp / 16.0, 0.5 - max(f16.x, f16.y))) * (1.0 - smoothstep(0.25, 0.6, fp / 16.0));
                float jitter = fract(sin(dot(floor(g), vec2(12.9898, 78.233))) * 43758.5453) * (1.0 - smoothstep(0.1, 0.4, fp));
                col *= 0.92 + 0.16 * jitter;
                col = mix(col, col * 0.55, 0.35 * l1 + 0.5 * l16);
                float diff = max(dot(n, uSun), 0.0);
                // water: sun glint (Blinn) on the local vertical, darker diffuse
                vec3 viewDir = normalize(-vRel);
                float glint = pow(max(dot(up, normalize(uSun + viewDir)), 0.0), 120.0) * water * step(0.0, dot(up, uSun));
                vec3 lit = col * (0.12 + 0.88 * diff) + vec3(0.9, 0.85, 0.7) * glint * 0.7;
                if (uDebug > 0) {                                      // LOD level as a hue ramp: coarse = red ... fine = violet
                    float hue = clamp(uLevel / 22.0, 0.0, 1.0) * 0.8;
                    vec3 lc = clamp(abs(mod(hue * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
                    lit = mix(lc, lit, 0.25);
                }
                fragColor = vec4(lit, 1.0);
            }
            """;

    static final String ATMO_VERTEX = """
            #version 150
            out vec2 vNdc;
            void main() {
                vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
                vNdc = p * 2.0 - 1.0;
                gl_Position = vec4(vNdc, 0.0, 1.0);
            }
            """;

    /**
     * Analytic single-scattering atmosphere (Rayleigh + Mie), full-screen, blended as
     * result = inscatter + scene * transmittance. Radial coordinates are kept as (altitude, mu) pairs
     * so float precision survives planet-sized radii.
     */
    static final String ATMO_FRAGMENT = """
            #version 150
            in vec2 vNdc;
            uniform mat4 uInvProj;
            uniform mat4 uView;       // rotation only
            uniform vec3 uUp;         // unit vector from planet centre to camera
            uniform vec3 uSun;
            uniform float uR0;        // camera radius from the planet centre
            uniform float uH0;        // camera altitude above the baseline radius (precise, from double)
            uniform float uR;         // planet baseline radius
            uniform float uAtmH;      // atmosphere height
            uniform float uClouds;    // 1 = draw the planetary cloud layer
            uniform float uTime;      // simulation seconds (cloud drift)
            uniform vec3 uOccC[2];    // other bodies that can hide stars and the sun: centre relative to the camera (E axes) ...
            uniform float uOccR[2];   // ... and radius (0 = unused)
            out vec4 fragColor;
            const float HR = 8000.0;
            const float HM = 1200.0;
            const vec3 BR = vec3(5.8e-6, 13.5e-6, 33.1e-6);
            const float BM = 21e-6;
            const float PI = 3.14159265;

            // ray from the camera (cos angle mu to local up) against the sphere of radius R + dh
            vec2 sphere(float mu, float dh) {
                float b = uR0 * mu;
                float c = (uH0 - dh) * (uR0 + uR + dh);
                float disc = b * b - c;
                if (disc < 0.0) return vec2(1.0, -1.0);
                float q = sqrt(disc);
                return vec2(-b - q, -b + q);
            }

            float ch3(vec3 p) {
                p = fract(p * 0.1031);
                p += dot(p, p.zyx + 31.32);
                return fract((p.x + p.y) * p.z);
            }
            float vnoise(vec3 x) {
                vec3 i = floor(x), f = fract(x);
                f = f * f * (3.0 - 2.0 * f);
                return mix(mix(mix(ch3(i), ch3(i + vec3(1, 0, 0)), f.x), mix(ch3(i + vec3(0, 1, 0)), ch3(i + vec3(1, 1, 0)), f.x), f.y),
                           mix(mix(ch3(i + vec3(0, 0, 1)), ch3(i + vec3(1, 0, 1)), f.x), mix(ch3(i + vec3(0, 1, 1)), ch3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
            }
            float cfbm(vec3 p, int oct) {
                float a = 0.5, s = 0.0;
                for (int i = 0; i < 9; i++) {
                    if (i >= oct) break;
                    s += a * vnoise(p);
                    p = p * 2.03 + vec3(7.1, 3.3, 5.2);
                    a *= 0.5;
                }
                return s;
            }
            // cloud cover at unit direction q; dist = camera distance (m): nearer clouds get finer octaves
            float cloudDensity(vec3 q, float dist) {
                vec3 drift = vec3(uTime * 2.0e-5, 0.0, uTime * 1.2e-5);
                vec3 w = vec3(cfbm(q * 3.0 + 4.0, 3), cfbm(q * 3.0 + 9.0, 3), cfbm(q * 3.0 + 1.0, 3)) - 0.5;
                vec3 p = q * 5.0 + 1.1 * w + drift;
                int oct = 5 + int(clamp(4.0 * (1.0 - dist / 4.0e5), 0.0, 4.0));
                float f = cfbm(p, oct);
                float lat = abs(q.z);                                   // planet z = spin axis
                float bands = 0.62 + 0.38 * cos(lat * 9.4247);           // wet near the equator and near 60 deg, dry subtropics
                return smoothstep(0.54, 0.76, f * (0.82 + 0.36 * bands));
            }

            float hash3(vec3 p) {
                p = fract(p * 0.3183099 + 0.1);
                p *= 17.0;
                return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
            }

            // sparse point stars on the direction sphere
            vec3 stars(vec3 d) {
                vec3 sp = d * 180.0, c = floor(sp);
                float h = hash3(c);
                vec3 o = vec3(hash3(c + 1.0), hash3(c + 2.0), hash3(c + 3.0)) - 0.5;
                float dist = length(fract(sp) - 0.5 - o * 0.6);
                float star = step(0.985, h) * smoothstep(0.22, 0.0, dist) * (0.35 + 0.65 * hash3(c + 7.0));
                return vec3(star) * mix(vec3(0.8, 0.9, 1.0), vec3(1.0, 0.9, 0.8), hash3(c + 11.0));
            }

            void main() {
                // near-plane point: with far=1e9 the far-plane point sits at infinity (w ~ 0 -> NaN)
                vec4 v = uInvProj * vec4(vNdc, -1.0, 1.0);
                vec3 d = normalize(transpose(mat3(uView)) * normalize(v.xyz / v.w));
                if (any(isnan(d))) { fragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
                float mu = dot(d, uUp);
                vec2 gnd = sphere(mu, 0.0);
                bool hitsPlanet = gnd.x < gnd.y && gnd.x > 0.0;
                bool hidden = hitsPlanet;
                for (int k = 0; k < 2; k++) {                        // other bodies hide what is behind them
                    if (uOccR[k] <= 0.0) continue;
                    vec3 oc = -uOccC[k];                             // camera relative to the body centre
                    float b = dot(oc, d), cc = dot(oc, oc) - uOccR[k] * uOccR[k];
                    float disc = b * b - cc;
                    if (disc > 0.0 && -b - sqrt(disc) > 0.0) hidden = true;
                }
                vec3 starCol = hidden ? vec3(0.0) : stars(d);
                // the sun: a hard disc (angular radius 0.0047 rad = the real Sun from 1 AU) with a soft corona
                float cs = dot(d, uSun);
                float sunDisc = smoothstep(0.99998917, 0.99999, cs) * 14.0 + pow(max(cs, 0.0), 900.0) * 0.9 + pow(max(cs, 0.0), 60.0) * 0.05;
                if (!hidden) starCol += vec3(1.0, 0.96, 0.88) * sunDisc;
                vec2 atm = sphere(mu, uAtmH);
                if (atm.y <= 0.0 || atm.x > atm.y) { fragColor = vec4(starCol, 1.0); return; }
                float s0 = max(atm.x, 0.0), s1 = atm.y;
                if (hitsPlanet) s1 = min(s1, gnd.x);
                if (s1 <= s0) { fragColor = vec4(starCol, 1.0); return; }

                const int N = 16;
                float ds = (s1 - s0) / float(N);
                float cosS = dot(d, uSun);
                float phaseR = 3.0 / (16.0 * PI) * (1.0 + cosS * cosS);
                const float g = 0.76;
                float phaseM = 3.0 / (8.0 * PI) * ((1.0 - g * g) * (1.0 + cosS * cosS))
                        / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * cosS, 1.5));
                float odR = 0.0, odM = 0.0;
                vec3 L = vec3(0.0);
                for (int i = 0; i < N; i++) {
                    float s = s0 + (float(i) + 0.5) * ds;
                    vec3 p = uR0 * uUp + s * d;
                    float r = length(p);
                    float h = max(r - uR, 0.0);
                    float rhoR = exp(-h / HR), rhoM = exp(-h / HM);
                    odR += rhoR * ds; odM += rhoM * ds;
                    // sun visibility: planet shadow, then optical depth to the top of the atmosphere
                    float b = dot(p, uSun);
                    float cp = (r - uR) * (r + uR);
                    float disc = b * b - cp;
                    if (disc >= 0.0 && -b - sqrt(disc) > 0.0) continue;
                    float ra = uR + uAtmH;
                    float disc2 = b * b - (r - ra) * (r + ra);
                    float sExit = -b + sqrt(max(disc2, 0.0));
                    float ls = sExit / 4.0, sR = 0.0, sM = 0.0;
                    for (int j = 0; j < 4; j++) {
                        vec3 ps = p + uSun * ((float(j) + 0.5) * ls);
                        float hs = max(length(ps) - uR, 0.0);
                        sR += exp(-hs / HR) * ls; sM += exp(-hs / HM) * ls;
                    }
                    vec3 tau = BR * (odR + sR) + vec3(BM * 1.1) * (odM + sM);
                    L += exp(-tau) * (rhoR * BR * phaseR + vec3(rhoM * BM * phaseM)) * ds;
                }
                float tView = exp(-(BR.g * odR + BM * 1.1 * odM));
                vec3 col = 1.0 - exp(-L * 22.0);
                float cA = 0.0; vec3 cC = vec3(0.0);
                if (uClouds > 0.5) {
                    vec2 sh = sphere(mu, 4000.0);
                    float sc = -1.0;
                    if (uH0 > 4000.0) { if (sh.x > 0.0) sc = sh.x; } else if (sh.y > 0.0) sc = sh.y;
                    float tGround = hitsPlanet ? gnd.x : 1.0e30;
                    if (sc > 0.0 && sc < tGround) {
                        vec3 P = uR0 * uUp + sc * d;
                        vec3 q = normalize(P);
                        float dens = cloudDensity(q, sc);
                        if (dens > 0.001) {
                            float sunUp = dot(q, uSun);
                            vec3 tang = normalize(uSun - q * sunUp + 1.0e-4);
                            float dens2 = cloudDensity(normalize(q + tang * 0.004), sc);    // density a bit towards the sun: self shadow
                            float shade = mix(1.0, 0.55, clamp((dens - dens2) * 3.0, 0.0, 1.0));
                            float lit = clamp(sunUp * 1.1 + 0.18, 0.0, 1.0);
                            float edge = pow(1.0 - clamp(abs(mu), 0.0, 1.0), 2.0);           // limb: thicker slab seen at a grazing angle
                            cA = clamp(dens * (0.75 + 0.2 * edge), 0.0, 0.92);
                            // the sun's light reaching the cloud is reddened near the terminator (path through air), tinted by the atmosphere's own colour
                            vec3 sunCol = mix(vec3(1.0, 0.55, 0.30), vec3(1.0, 0.98, 0.94), smoothstep(-0.05, 0.35, sunUp));
                            cC = sunCol * (0.06 + 0.94 * lit) * shade;
                        }
                    }
                }
                fragColor = vec4(col + starCol * tView * (1.0 - cA) + cC * cA, tView * (1.0 - cA));   // stars shine through the atmosphere, dimmed; clouds cover ground and stars
            }
            """;

    static int compileAtmosphere() {
        int vs = compile(GL20.GL_VERTEX_SHADER, ATMO_VERTEX);
        int fs = compile(GL20.GL_FRAGMENT_SHADER, ATMO_FRAGMENT);
        int prog = GL20.glCreateProgram();
        GL20.glAttachShader(prog, vs);
        GL20.glAttachShader(prog, fs);
        GL20.glLinkProgram(prog);
        if (GL20.glGetProgrami(prog, GL20.GL_LINK_STATUS) == 0)
            throw new IllegalStateException("atmosphere link failed: " + GL20.glGetProgramInfoLog(prog));
        GL20.glDeleteShader(vs);
        GL20.glDeleteShader(fs);
        return prog;
    }

    static int compileProgram() {
        int vs = compile(GL20.GL_VERTEX_SHADER, VERTEX);
        int fs = compile(GL20.GL_FRAGMENT_SHADER, FRAGMENT);
        int prog = GL20.glCreateProgram();
        GL20.glAttachShader(prog, vs);
        GL20.glAttachShader(prog, fs);
        GL20.glBindAttribLocation(prog, 0, "aPos");
        GL20.glBindAttribLocation(prog, 1, "aMorph");
        GL20.glBindAttribLocation(prog, 2, "aColor");
        GL20.glLinkProgram(prog);
        if (GL20.glGetProgrami(prog, GL20.GL_LINK_STATUS) == 0)
            throw new IllegalStateException("planet shader link failed: " + GL20.glGetProgramInfoLog(prog));
        GL20.glDeleteShader(vs);
        GL20.glDeleteShader(fs);
        return prog;
    }

    private static int compile(int type, String src) {
        int s = GL20.glCreateShader(type);
        GL20.glShaderSource(s, src);
        GL20.glCompileShader(s);
        if (GL20.glGetShaderi(s, GL20.GL_COMPILE_STATUS) == 0)
            throw new IllegalStateException("planet shader compile failed: " + GL20.glGetShaderInfoLog(s));
        return s;
    }
}
