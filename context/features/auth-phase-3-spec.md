# Auth UI - Sign In, Register & Sign Out

## Overview

Replace NextAuth default pages with custom UI. Update user icon, email and username in bottom of sidebar.
The login / register page should be split in two fractions, one is good image of the apiary with the overlay and welcoming text and the second one the actual user credential login / register with credentials or google

## Requirements

### Sign In Page (`/sign-in`)

- Email and password input fields
- "Sign in with Google" button
- Link to register page
- Form validation and error display

### Register Page (`/register`)

- Name, email, password, confirm password fields
- Form validation (passwords match, email format)
- Submit to `/api/auth/register`
- Redirect to sign-in on success

### Bottom Of Sidebar

- Display user avatar (Goolge image or initials fallback)
- Display user name
- Dropdown/up on avatar click with "Sign out" link
- Clicking on the icon should go to "/profile"

### Mobile Top Bar

The sidebar footer is `lg`-and-up only, so on phones there is currently no way to
sign out at all. Mirror the footer's avatar into the mobile top bar:

- Same avatar component, shown only below `lg` (the sidebar keeps it from `lg` up)
- Same dropdown on tap: "Sign out", and the avatar itself links to `/profile`
- Sits in the top bar's right-hand action group, before "Dodaj ul"
- Leave the bottom tab bar alone — it stays navigation-only

## Notes

### Avatar Logic

- If user has `image` (from Google): use that
- Otherwise: generate initials from name (e.g., "Brad Traversy" → "BT")

### Initials Component

Create a reusable avatar component that handles both cases.

## Testing

1. Go to `/sign-in` - verify custom page renders
2. Sign in with Google - verify flow works
3. Sign in with email/password - verify flow works
4. Verify avatar shows in top bar (Google image or initials)
5. Click avatar - verify dropdown appears
6. Click "Sign out" - verify logout and redirect
7. Go to `/register` - create new account - verify redirect to sign-in
8. Narrow the viewport below `lg` - verify the avatar appears in the top bar, opens the same dropdown, and signs out
