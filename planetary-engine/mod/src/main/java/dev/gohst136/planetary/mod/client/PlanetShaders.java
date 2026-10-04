package dev.gohst136.planetary.mod.client;

import org.lwjgl.opengl.GL20;

/** GLSL 1.50 (core) program for patch rendering: geomorph, camera-relative offset, log depth, height colouring. */
final class PlanetShaders {
    private PlanetShaders() {}

    static final String VERTEX = """
            #version 150
            in vec3 aPos;
            in vec3 aMorph;
            in float aHeight;
            uniform mat4 uProj;
            uniform mat4 uView;       // rotation only (camera sits at the origin)
            uniform vec3 uOffset;     // patch origin - camera, computed in double on the CPU
            uniform float uMorph;     // 0 = own grid, 1 = parent grid
            uniform float uFarLog;    // log2(far + 1)
            uniform vec3 uOriginMod;  // patch origin modulo 1024 m (double on CPU) so the 1 m grid stays precise
            out vec3 vLocal;
            out vec3 vRel;
            out float vHeight;
            void main() {
                vec3 rel = uOffset + mix(aPos, aMorph, uMorph);
                vRel = rel;
                vLocal = mix(aPos, aMorph, uMorph) + uOriginMod;
                vHeight = aHeight;
                vec4 c = uProj * uView * vec4(rel, 1.0);
                c.z = (2.0 * log2(max(1e-6, 1.0 + c.w)) / uFarLog - 1.0) * c.w;
                gl_Position = c;
            }
            """;

    static final String FRAGMENT = """
            #version 150
            in vec3 vRel;
            in vec3 vLocal;
            in float vHeight;
            uniform vec3 uSun;        // unit vector towards the sun (planet frame == world axes)
            uniform vec3 uCamPos;     // camera position in planet frame (float is fine for a direction)
            out vec4 fragColor;
            void main() {
                float h = vHeight;
                vec3 col;
                if (h < 0.0) {
                    col = mix(vec3(0.01, 0.07, 0.25), vec3(0.06, 0.38, 0.62), clamp(1.0 + h / 3000.0, 0.0, 1.0));
                } else if (h < 120.0) {
                    col = mix(vec3(0.76, 0.70, 0.50), vec3(0.20, 0.50, 0.15), smoothstep(0.0, 120.0, h));
                } else if (h < 2500.0) {
                    col = mix(vec3(0.20, 0.50, 0.15), vec3(0.42, 0.38, 0.33), smoothstep(120.0, 2500.0, h));
                } else {
                    col = mix(vec3(0.42, 0.38, 0.33), vec3(0.95, 0.96, 1.0), smoothstep(2500.0, 4500.0, h));
                }
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
                fragColor = vec4(col * (0.12 + 0.88 * diff), 1.0);
            }
            """;

    static int compileProgram() {
        int vs = compile(GL20.GL_VERTEX_SHADER, VERTEX);
        int fs = compile(GL20.GL_FRAGMENT_SHADER, FRAGMENT);
        int prog = GL20.glCreateProgram();
        GL20.glAttachShader(prog, vs);
        GL20.glAttachShader(prog, fs);
        GL20.glBindAttribLocation(prog, 0, "aPos");
        GL20.glBindAttribLocation(prog, 1, "aMorph");
        GL20.glBindAttribLocation(prog, 2, "aHeight");
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
