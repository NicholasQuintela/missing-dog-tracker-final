# Pet Alert PH — No Email Verification + Forgot Password/Delete Account

## Included
- Signup no longer supplies an email redirect URL.
- Login includes a Forgot password link.
- Forgot password explains that password recovery is unavailable.
- Users can prepare an account-deletion request email with a fixed subject.
- CAPTCHA is checked before the email app opens.
- Passwords are never requested, stored, or sent to support.

## Required Supabase dashboard change
Authentication → Providers → Email → turn OFF Confirm Email, then Save.

## Gmail filter
Subject: `Pet Alert PH - Delete Account Request`
Suggested label: `Pet Alert PH/Account Deletion`
