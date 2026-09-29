-- Run before deploying the expanded category UI. Existing product values are preserved.
BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.shipandbattle_products
  DROP CONSTRAINT IF EXISTS shipandbattle_products_category_valid;
ALTER TABLE public.shipandbattle_products
  ADD CONSTRAINT shipandbattle_products_category_valid CHECK (
    shipandbattle_category IS NULL OR shipandbattle_category IN (
      'ai-tools', 'developer-tools', 'productivity', 'marketing',
      'design-tools', 'video-tools', 'founder-tools', 'saas',
      'ai-agents', 'ai-chatbots', 'ai-image-generators', 'ai-video-generators',
      'ai-writing', 'voice-ai', 'llms', 'ai-meeting-assistants',
      'code-editors', 'apis', 'no-code', 'databases', 'hosting', 'testing',
      'monitoring', 'authentication', 'open-source-tools',
      'note-taking', 'project-management', 'calendar-scheduling', 'workflow-automation',
      'email-tools', 'file-management', 'team-collaboration', 'focus-time-tracking',
      'seo', 'social-media', 'email-marketing', 'crm', 'lead-generation', 'analytics', 'customer-support',
      'ui-design', 'graphic-design', 'website-builders', 'video-editing', 'screen-recording',
      'audio-music', 'presentations', '3d-animation',
      'ecommerce', 'payments', 'accounting', 'personal-finance', 'hiring', 'legal', 'launch-tools',
      'education', 'health-fitness', 'travel', 'communities', 'gaming', 'news-reading'
    )
  );

NOTIFY pgrst, 'reload schema';
COMMIT;
