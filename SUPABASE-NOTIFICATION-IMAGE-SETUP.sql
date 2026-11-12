-- Run once in Supabase SQL Editor.
-- Public read is needed so notification clients can fetch the image. Only the server uploads/deletes with its secret key.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lisa-notification-temp', 'lisa-notification-temp', true, 1258291, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 1258291, allowed_mime_types = array['image/jpeg','image/png','image/webp'];
