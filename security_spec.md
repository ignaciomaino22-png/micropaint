# Security Specification

## 1. Data Invariants
- A `Drawing` cannot exist without a valid creator user ID.
- A user cannot write a `Drawing` if they are banned (i.e., if their user ID exists in the `bans` collection).
- The `imageUrl` must be a valid base64 image and constrained in size.
- A drawing's `pointsText` must be a valid delimited sequence of points.
- The `isAdmin()` helper checks if the user's email is `ignaciomaino22@gmail.com` and email is verified.
- Only admins can write to the `bans` collection.
- Only admins can delete drawings.

## 2. The "Dirty Dozen" Payloads (Aesthetic Security Break attempts)
1. **Unauthenticated Drawing Creation**: An attacker attempts to create a drawing without a Firebase Auth session.
2. **Identity Spoofing**: User `attacker123` attempts to create a drawing setting `userId: "victim456"`.
3. **Privilege Escalation**: User attempts to create a ban document on another user.
4. **Self-Banishment Override**: User attempts to delete their ban document.
5. **Self-Promotion to Admin**: User attempts to write to a simulated Admin document or bypass restrictions.
6. **Malicious Giant Drawing Payload**: Attacker posts a 5MB base64 string directly to Firestore.
7. **Malicious ID Poisoning**: Attacker uses a massive 2KB ID string for a drawing.
8. **Banned User Drawing Submission**: A banned user ID tries to create a new drawing document.
9. **Tampering with Immutable Timestamps**: Attacker sets `createdAt` to a future date instead of `request.time`.
10. **Shadow Field Update**: Attacker attempts to update a drawing with an unlisted field like `isApprovedByModerator: true`.
11. **Client Delegation List Bypass**: Unauthenticated client attempts to read all users.
12. **Drawings Deletion Bypass**: A regular, non-admin user attempts to delete a drawing belonging to another user.

## 3. Test Cases (TDD Blueprint)
Every rule should return `PERMISSION_DENIED` for the above dirty dozen test scenarios.
Only verified admins (`ignaciomaino22@gmail.com`) have full deletion and ban writing capabilities.
Banned users are locked out of all write operations globally.
