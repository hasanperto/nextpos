-- Aynı offlineId ile tekrar push'ta çift sipariş önleme
DELETE FROM "sync_queue" WHERE "entity_id" IS NULL OR trim("entity_id") = '';

ALTER TABLE "sync_queue" ALTER COLUMN "entity_id" SET NOT NULL;

ALTER TABLE "sync_queue" ALTER COLUMN "entity_id" TYPE VARCHAR(64);

-- İndeks db push / önceki denemede zaten varsa tekrar oluşturma (42P07 önlemi)
CREATE UNIQUE INDEX IF NOT EXISTS "sync_queue_tenant_id_entity_id_key" ON "sync_queue"("tenant_id", "entity_id");
