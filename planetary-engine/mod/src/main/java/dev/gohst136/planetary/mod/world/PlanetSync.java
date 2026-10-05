package dev.gohst136.planetary.mod.world;

import dev.gohst136.planetary.world.ModificationDatabase;
import io.netty.buffer.ByteBuf;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.event.entity.player.PlayerEvent;
import net.neoforged.neoforge.event.tick.ServerTickEvent;
import net.neoforged.neoforge.network.PacketDistributor;
import net.neoforged.neoforge.network.event.RegisterPayloadHandlersEvent;
import net.neoforged.neoforge.network.registration.PayloadRegistrar;

/**
 * Server -> client sync of the planet's edits (docs/NETWORKING.md). The server is authoritative; clients only mirror the column heights
 * (the far field needs nothing else). Two payloads: a full snapshot when a player joins, and small batches of changed columns (at most
 * once per tick) afterwards. In singleplayer client and server share {@link PlanetEdits#DB}, so applying is an idempotent no-op.
 */
@EventBusSubscriber(modid = "planetary")
public final class PlanetSync {
    private PlanetSync() {}

    public record Snapshot(byte[] data) implements CustomPacketPayload {
        public static final Type<Snapshot> TYPE = new Type<>(ResourceLocation.fromNamespaceAndPath("planetary", "edits_snapshot"));
        public static final StreamCodec<ByteBuf, Snapshot> CODEC = ByteBufCodecs.BYTE_ARRAY.map(Snapshot::new, Snapshot::data);
        @Override public Type<? extends CustomPacketPayload> type() { return TYPE; }
    }

    /** Changed columns: x, z, surface y triples. */
    public record Columns(int[] xzy) implements CustomPacketPayload {
        public static final Type<Columns> TYPE = new Type<>(ResourceLocation.fromNamespaceAndPath("planetary", "edits_columns"));
        public static final StreamCodec<ByteBuf, Columns> CODEC = StreamCodec.of(
            (buf, p) -> { ByteBufCodecs.VAR_INT.encode(buf, p.xzy.length); for (int v : p.xzy) ByteBufCodecs.VAR_INT.encode(buf, v); },
            buf -> {
                int n = ByteBufCodecs.VAR_INT.decode(buf);
                if (n < 0 || n > 3 * 4096 || n % 3 != 0) throw new IllegalArgumentException("bad column batch");
                int[] a = new int[n];
                for (int i = 0; i < n; i++) a[i] = ByteBufCodecs.VAR_INT.decode(buf);
                return new Columns(a);
            });
        @Override public Type<? extends CustomPacketPayload> type() { return TYPE; }
    }

    private static final List<int[]> pending = new ArrayList<>();

    /** Called by the server when a column's surface changed. */
    static synchronized void queue(int x, int z, int top) { pending.add(new int[] {x, z, top}); }

    @SubscribeEvent
    public static void register(RegisterPayloadHandlersEvent e) {
        PayloadRegistrar r = e.registrar("1").optional();      // optional: vanilla clients may join, they just have no far-field edits
        r.playToClient(Snapshot.TYPE, Snapshot.CODEC, (p, ctx) -> ctx.enqueueWork(() -> {
            if (!ctx.player().level().isClientSide()) return;
            PlanetEdits.DB.replaceWith(ModificationDatabase.deserialize(p.data()));
        }));
        r.playToClient(Columns.TYPE, Columns.CODEC, (p, ctx) -> ctx.enqueueWork(() -> {
            for (int i = 0; i + 2 < p.xzy().length; i += 3) PlanetEdits.DB.setColumnTop(p.xzy()[i], p.xzy()[i + 1], p.xzy()[i + 2]);
        }));
    }

    @SubscribeEvent
    public static void join(PlayerEvent.PlayerLoggedInEvent e) {
        if (e.getEntity() instanceof ServerPlayer sp && sp.getServer() != null && sp.getServer().isDedicatedServer() && PlanetEdits.DB.regionCount() > 0)
            PacketDistributor.sendToPlayer(sp, new Snapshot(PlanetEdits.DB.serialize()));
    }

    @SubscribeEvent
    public static void tick(ServerTickEvent.Post e) {
        int[] batch;
        synchronized (PlanetSync.class) {
            if (pending.isEmpty()) return;
            int n = Math.min(pending.size(), 4096);
            batch = new int[n * 3];
            for (int i = 0; i < n; i++) { int[] c = pending.get(i); batch[3 * i] = c[0]; batch[3 * i + 1] = c[1]; batch[3 * i + 2] = c[2]; }
            pending.subList(0, n).clear();
        }
        if (e.getServer().isDedicatedServer()) PacketDistributor.sendToAllPlayers(new Columns(batch));
    }
}
