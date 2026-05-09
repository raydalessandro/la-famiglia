-- ═══ CHAT BUCKET — storage bucket for chat media (images, documents) ═══
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat', 'chat', true)
ON CONFLICT (id) DO NOTHING;
