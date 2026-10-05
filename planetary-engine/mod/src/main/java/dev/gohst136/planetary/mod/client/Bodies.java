package dev.gohst136.planetary.mod.client;

import dev.gohst136.planetary.lod.CameraView;
import dev.gohst136.planetary.lod.QuadtreeSelector;
import dev.gohst136.planetary.math.Vec3;
import dev.gohst136.planetary.mesh.PatchMeshBuilder;
import dev.gohst136.planetary.planet.PlanetDefinition;
import dev.gohst136.planetary.system.BodyDefinition;
import dev.gohst136.planetary.system.StarSystem;
import dev.gohst136.planetary.terrain.CraterTerrain;
import dev.gohst136.planetary.terrain.TerrainSampler;
import org.joml.Matrix4f;

import java.util.ArrayList;
import java.util.List;

/**
 * Renders every body of the star system except the one the render frame is attached to (the "home" planet, drawn by the main
 * pipeline). Each body owns a terrain sampler, a quadtree selector and a GL renderer (own mesh cache, own worker pool).
 * All positions are computed in the home planet's body-fixed frame E; a body's own frame B is related to E by the analytic
 * spin/orbit of {@link StarSystem}, so lighting, parallax and the day/night cycle are consistent with the clock.
 *
 * Thread ownership: render thread only (selectors, GL); meshes are built on each renderer's worker pool.
 */
final class Bodies {
    static final class Instance {
        final BodyDefinition def;
        final PlanetDefinition planet;
        final TerrainSampler terrain;
        final QuadtreeSelector selector;
        final GlPlanetRenderer renderer;
        QuadtreeSelector.Result last;
        double angularRadiusPx;

        Instance(BodyDefinition def, PlanetDefinition planet, TerrainSampler terrain) {
            this.def = def; this.planet = planet; this.terrain = terrain;
            this.selector = new QuadtreeSelector(planet, terrain, QuadtreeSelector.Params.defaults());
            this.renderer = new GlPlanetRenderer(new PatchMeshBuilder(planet, terrain), planet, 2);
            this.renderer.pinCoarse();
        }
    }

    private final StarSystem sys;
    private final String home;
    private final List<Instance> instances = new ArrayList<>();

    Bodies(StarSystem sys, String home) {
        this.sys = sys; this.home = home;
        for (BodyDefinition d : sys.bodies()) {
            if (d.id().equals(home) || d.kind() == BodyDefinition.Kind.STAR) continue;
            PlanetDefinition pd = new PlanetDefinition("planetary:" + d.id(), d.seed(), d.radius(), d.surfaceGravity(), 0,
                    Math.min(9000.0, 0.005 * d.radius() + 500), Math.min(9000.0, 0.004 * d.radius() + 500), d.rotationPeriod(), 0, 14);
            boolean rusty = d.kind() == BodyDefinition.Kind.PLANET;
            TerrainSampler ts = rusty ? new CraterTerrain(pd, 1.35, 0.85, 0.6) : new CraterTerrain(pd);
            instances.add(new Instance(d, pd, ts));
        }
    }

    List<Instance> instances() { return instances; }

    /** v_B -> v_E for body b (rotation only). */
    private Vec3 eFromB(String b, double t, Vec3 v) { return sys.systemToBody(home, t, sys.bodyToSystem(b, t, v)); }
    private Vec3 bFromE(String b, double t, Vec3 v) { return sys.systemToBody(b, t, sys.bodyToSystem(home, t, v)); }

    /** Body centre in the home frame E (metres). */
    Vec3 centreE(String b, double t) { return sys.systemToBody(home, t, sys.position(b, t).sub(sys.position(home, t))); }

    Instance instance(String id) { for (Instance in : instances) if (in.def.id().equals(id)) return in; return null; }

    /** A point given in body b's fixed frame -> the home frame E. */
    Vec3 toE(String b, double t, Vec3 pB) { return centreE(b, t).add(eFromB(b, t, pB)); }

    /** A point of the home frame E -> body b's fixed frame. */
    Vec3 fromE(String b, double t, Vec3 pE) { return bFromE(b, t, pE.sub(centreE(b, t))); }

    /** Unit direction from body b towards the star, in b's fixed frame. */
    Vec3 sunDirB(String b, double t) { return bFromE(b, t, sys.systemToBody(home, t, sys.position(b, t).mul(-1.0)).normalize()); }

    /** Direction-only conversion E <-> B. */
    Vec3 dirToE(String b, double t, Vec3 vB) { return eFromB(b, t, vB); }
    Vec3 dirFromE(String b, double t, Vec3 vE) { return bFromE(b, t, vE); }

    /** Unit direction towards the star, seen from the home planet, in E axes. */
    Vec3 sunDirE(double t) { return sys.systemToBody(home, t, sys.position(home, t).mul(-1.0)).normalize(); }

    void draw(double t, Vec3 camE, Vec3 fwdE, Vec3 upE, double fovY, int viewportH, int viewportW, double speed,
              Matrix4f viewE, Matrix4f proj) {
        // far bodies first: they must not be overdrawn by near ones (depth is shared, so order only matters for blending)
        for (Instance in : instances) {
            String b = in.def.id();
            Vec3 rel = camE.sub(centreE(b, t));                       // camera relative to the body centre, E axes
            Vec3 camB = bFromE(b, t, rel);
            double dist = camB.length();
            // sub-pixel bodies are skipped (a distant planet is a point of light, drawn by the sky pass)
            in.angularRadiusPx = in.planet.radius() / dist * viewportH / (2.0 * Math.tan(fovY / 2.0));
            if (in.angularRadiusPx < 0.4) { in.last = null; continue; }
            Vec3 fwdB = bFromE(b, t, fwdE), upB = bFromE(b, t, upE);
            Vec3 sunB = bFromE(b, t, sys.systemToBody(home, t, sys.position(b, t).mul(-1.0)).normalize());   // towards the star, from the body
            CameraView cv = new CameraView(camB, fwdB, upB, fovY, viewportH, viewportW, speed);
            in.last = in.selector.select(cv);
            // view': B-frame vectors -> E-frame vectors -> camera
            Vec3 ex = eFromB(b, t, new Vec3(1, 0, 0)), ey = eFromB(b, t, new Vec3(0, 1, 0)), ez = eFromB(b, t, new Vec3(0, 0, 1));
            Matrix4f rot = new Matrix4f(
                    (float) ex.x(), (float) ex.y(), (float) ex.z(), 0f,
                    (float) ey.x(), (float) ey.y(), (float) ey.z(), 0f,
                    (float) ez.x(), (float) ez.y(), (float) ez.z(), 0f,
                    0f, 0f, 0f, 1f);
            Matrix4f viewB = new Matrix4f(viewE).mul(rot);
            float[] sun = {(float) sunB.x(), (float) sunB.y(), (float) sunB.z()};
            in.renderer.drawFrame(in.last.patches, new double[]{camB.x(), camB.y(), camB.z()}, viewB, proj, sun);
        }
    }

    /** Unit-sphere occluders for the sky pass: centre direction*distance in E axes (camera-relative) and radius. */
    void occluders(double t, Vec3 camE, float[] centres, float[] radii) {
        int i = 0;
        for (Instance in : instances) {
            if (i >= radii.length) break;
            Vec3 c = centreE(in.def.id(), t).sub(camE);
            centres[i * 3] = (float) c.x(); centres[i * 3 + 1] = (float) c.y(); centres[i * 3 + 2] = (float) c.z();
            radii[i] = (float) in.planet.radius();
            i++;
        }
        for (; i < radii.length; i++) radii[i] = 0f;
    }

    void close() { for (Instance in : instances) in.renderer.close(); instances.clear(); }
}
