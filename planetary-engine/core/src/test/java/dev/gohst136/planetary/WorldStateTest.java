package dev.gohst136.planetary;

import dev.gohst136.planetary.math.Vec3;
import dev.gohst136.planetary.net.PlanetStatePacket;
import dev.gohst136.planetary.planet.PlanetDefinition;
import dev.gohst136.planetary.planet.PlaneUnwrap;
import dev.gohst136.planetary.terrain.ModifiedTerrain;
import dev.gohst136.planetary.terrain.RealisticTerrain;
import dev.gohst136.planetary.world.ModificationDatabase;
import org.junit.jupiter.api.Test;
import java.util.Random;
import static org.junit.jupiter.api.Assertions.*;

class WorldStateTest {
    @Test void databaseStoresOnlyWhatChangedAndRoundTrips() {
        ModificationDatabase db = new ModificationDatabase();
        Random r = new Random(5);
        int n = 20000;
        for (int i = 0; i < n; i++) {
            int x = 4_000_000 + r.nextInt(300), z = -12_000_000 + r.nextInt(300), y = r.nextInt(400);
            db.setBlock(x, y, z, (short) r.nextInt(2000));
            if (i % 4 == 0) db.setColumnTop(x, z, y);
        }
        assertNull(db.getBlock(1, 2, 3), "unmodified blocks are not stored");
        byte[] bytes = db.serialize();
        System.out.printf("%d edits -> %d bytes (%.2f bytes/edit), %d regions%n", db.blockCount(), bytes.length, bytes.length / (double) db.blockCount(), db.regionCount());
        assertTrue(bytes.length < 6.0 * db.blockCount(), "compact");
        ModificationDatabase back = ModificationDatabase.deserialize(bytes);
        assertEquals(db.blockCount(), back.blockCount());
        Random r2 = new Random(5);
        for (int i = 0; i < n; i++) {
            int x = 4_000_000 + r2.nextInt(300), z = -12_000_000 + r2.nextInt(300), y = r2.nextInt(400); r2.nextInt(2000);
            assertEquals(db.getBlock(x, y, z), back.getBlock(x, y, z));
            assertEquals(db.columnTop(x, z), back.columnTop(x, z));
        }
        assertArrayEquals(bytes, back.serialize(), "deterministic encoding");
    }

    @Test void farTerrainIgnoresEditsAndFineTerrainShowsThem() {
        PlanetDefinition p = PlanetDefinition.earth(3);
        RealisticTerrain base = new RealisticTerrain(p);
        ModificationDatabase db = new ModificationDatabase();
        Vec3 d = new Vec3(0.3, 0.2, 0.9).normalize();
        double half = p.radius() * Math.PI / 4.0;
        var m = PlaneUnwrap.map(d, half, 0.0);
        int x = (int) Math.floor(m.x1()), z = (int) Math.floor(m.z1());
        db.setColumnTop(x, z, 900);                                           // somebody built a 900 m tower here
        var t = new ModifiedTerrain(base, db, p.radius(), 2.0);
        assertEquals(base.heightAt(d, 10_000), t.heightAt(d, 10_000), 0.0, "coarse levels untouched");
        assertEquals(900.5, t.heightAt(d, 1.0), 0.01, "fine level shows the edit");
        double mid = t.heightAt(d, 5.0);
        assertTrue(Math.abs(mid - base.heightAt(d, 5.0)) < Math.abs(900.5 - base.heightAt(d, 5.0)), "blends between");
    }

    @Test void statePacketRoundTripsAtSolarSystemScale() {
        double x = 1.4959787e11, y = -3.2e8, z = 6371000.123;
        var pk = PlanetStatePacket.of((short) 7, (byte) (PlanetStatePacket.FLAG_INERTIAL | PlanetStatePacket.FLAG_ON_GROUND), x, y, z, 4.0e6f, -12.5f, 0f, 123456);
        var back = PlanetStatePacket.decode(pk.encode());
        assertEquals(pk, back);
        assertEquals(x, back.x(), 1.0 / 1024);
        assertEquals(z, back.z(), 1.0 / 1024);
        assertEquals(44, pk.encode().length);
        var next = PlanetStatePacket.of((short) 7, (byte) 0, x, y, z, 4.0e6f + 30f, -12.5f, 0f, 123457);
        assertTrue(next.plausibleAfter(pk, 0.05, 1000.0));
        assertFalse(PlanetStatePacket.of((short) 7, (byte) 0, x, y, z, 9.0e6f, 0f, 0f, 123458).plausibleAfter(pk, 0.05, 1000.0), "an instant 5,000 km/s jump is rejected");
    }
}
