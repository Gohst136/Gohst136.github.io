package dev.gohst136.planetary;

import static org.junit.jupiter.api.Assertions.*;

import dev.gohst136.planetary.world.ModificationDatabase;
import org.junit.jupiter.api.Test;

class ReplaceWithTest {
    @Test
    void saveLoadRoundTripIntoSharedInstance() {
        ModificationDatabase a = new ModificationDatabase();
        a.setBlock(-5, 70, 123456, (short) 42);
        a.setColumnTop(-5, 123456, 70);
        ModificationDatabase shared = new ModificationDatabase();
        shared.setBlock(1, 1, 1, (short) 1);
        shared.replaceWith(ModificationDatabase.deserialize(a.serialize()));
        assertNull(shared.getBlock(1, 1, 1));
        assertEquals((short) 42, shared.getBlock(-5, 70, 123456));
        assertEquals(70, shared.columnTop(-5, 123456));
    }
}
