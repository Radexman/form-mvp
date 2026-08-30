# Profile Page

## Overview

Create the profile page with user info, stats, current premium status and current premium features usage. change password and delete account.

## Requirements

- Create profile page at `/profile` route
- Display user info: email, name, avatar (Google or initials), account creation date
- Show usage stats: total apiaries, total beehives
- Add account actions: change password (email users only), delete account with confirmation
- Follow existing codebase patterns for data fetching and components

## Notes

- Avatar logic: Use Google avatar from OAuth if available, otherwise generate initials from name/email
- Change password button should only appear for users who signed up with email/password (not Google OAuth)
- Delete account needs confirmation dialog to prevent accidental deletion, this should be a danger zone featue so make the user type something like "DeleteMyAccount" to make double sure that they want to delete
- Prevent premium users from deleting their accounts I think is a good feature, consult best approaches with me when working
- Route should be protected (require authentication)

```

```
