# Pet Alert PH v1.1 Security and Admin Setup

1. Back up the working GitHub repository and Supabase project.
2. Run `pet-alert-ph-v1.1-security-admin.sql` in Supabase SQL Editor.
3. Find your user UUID under Supabase → Authentication → Users.
4. Make yourself super admin by running:

```sql
insert into public.admins(user_id,role)
values ('PASTE-YOUR-USER-UUID-HERE','super_admin')
on conflict(user_id) do update set role='super_admin';
```

5. Upload all project files to GitHub and wait for Vercel.
6. Visit `/admin` while logged in to your admin account.

## Admin model

- A normal user is not present in `public.admins`.
- An admin is a normal Supabase Auth account whose UUID is present in `public.admins`.
- `admin` can use moderation features.
- `super_admin` is intended for the operator and future role management.
- Hiding the admin link is not the security boundary; Row Level Security and database checks are.

## Important

The migration includes database rate limits and hardened Storage rules. Upload paths must keep the current format where the second path segment is the authenticated user UUID, such as `reports/<user-id>/<file>`.

Cloudflare Turnstile is not enabled automatically because it requires a Cloudflare site key and secret tied to your domain. Enable Supabase Auth CAPTCHA in the dashboard before a broad public launch.
