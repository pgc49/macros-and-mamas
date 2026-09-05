-- Reserve the real photo box on chat bubbles. Live/preview may lag this
-- file; the client retries writes and selects without these columns.

alter table public.messages
  add column if not exists attachment_width integer,
  add column if not exists attachment_height integer;

alter table public.conversation_messages
  add column if not exists attachment_width integer,
  add column if not exists attachment_height integer;

comment on column public.messages.attachment_width is
  'Pixel width of an image attachment, used to reserve bubble height.';
comment on column public.messages.attachment_height is
  'Pixel height of an image attachment, used to reserve bubble height.';
comment on column public.conversation_messages.attachment_width is
  'Pixel width of an image attachment, used to reserve bubble height.';
comment on column public.conversation_messages.attachment_height is
  'Pixel height of an image attachment, used to reserve bubble height.';
