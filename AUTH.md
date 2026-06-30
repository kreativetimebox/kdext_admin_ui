# Authentication System - Manual Result Analyzer

## Overview

The Manual Result Analyzer now includes a comprehensive role-based authentication and authorization system using JWT tokens and secure cookies. Only users with SuperAdmin, HITL, or Admin roles can access the admin application.

## Features

- **Role-Based Access Control (RBAC)**: Only SuperAdmin, HITL, and Admin roles can access the application
- **JWT Authentication**: Secure token-based authentication with 24-hour expiration
- **Automatic Session Management**: Secure HTTP-only cookies for storing authentication tokens
- **Activity Logging**: All login attempts (successful and failed) are logged in the database
- **Account Lockout**: Accounts are automatically locked after 5 failed login attempts for 30 minutes
- **Middleware Protection**: All routes are protected by authentication middleware
- **User Menu**: Displays current user information and provides logout functionality

## Database Tables Used

- `internal_users`: Stores user credentials and account information
- `roles`: Contains available roles (SUPER_ADMIN, HITL, ADMIN, etc.)
- `user_roles`: Maps users to their roles
- `internal_activity_logs`: Logs all authentication and access activities

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

This installs the required packages:
- `bcryptjs`: Password hashing
- `jose`: JWT token creation and verification

### 2. Create Admin Users

Use the provided script to create admin users:

```bash
# Create a SuperAdmin user
node scripts/create-admin.js admin@company.com "John" "Admin" "SecurePassword123" "SUPER_ADMIN"

# Create an HITL reviewer
node scripts/create-admin.js reviewer@company.com "Jane" "Reviewer" "SecurePassword456" "HITL"

# Create an Admin user with multiple roles
node scripts/create-admin.js editor@company.com "Bob" "Editor" "SecurePassword789" "ADMIN,HITL"
```

### 3. Set Environment Variables

Ensure these are set in your `.env` file:

```
MAIN_FINANCE_DB_URL=postgresql://user:password@host:port/database
JWT_SECRET=your-secret-key-change-in-production
```

### 4. Run the Application

```bash
npm run dev
```

The application will be available at `http://localhost:3000/auth/login`

## File Structure

### Authentication Files

```
app/
├── auth/
│   └── login/
│       └── page.js                 # Login page UI
├── api/
│   └── auth/
│       ├── login/route.js           # Login API endpoint
│       ├── logout/route.js          # Logout API endpoint
│       └── me/route.js              # Current user info endpoint
├── layout.js                        # Updated to wrap with providers
├── page.js                          # Home page (now protected)

components/
└── Navbar/
    └── Navbar.jsx                   # Updated with user menu and logout

lib/
├── useAuth.js                       # React hook for authentication
└── financedb.js                     # Database connection (using MAIN_FINANCE_DB)

middleware.js                        # Route protection middleware

scripts/
└── create-admin.js                  # Admin user creation script
```

## API Endpoints

### POST `/api/auth/login`

Authenticates user with email and password.

**Request:**
```json
{
  "email": "admin@company.com",
  "password": "SecurePassword123"
}
```

**Response (Success):**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "email": "admin@company.com",
    "roles": ["SUPER_ADMIN"]
  }
}
```

**Response (Error):**
```json
{
  "error": "Invalid credentials" | "Account is locked" | "You do not have permission to access this application"
}
```

### GET `/api/auth/me`

Returns current authenticated user information.

**Response (Authenticated):**
```json
{
  "authenticated": true,
  "user": {
    "id": 1,
    "email": "admin@company.com",
    "roles": ["SUPER_ADMIN"]
  }
}
```

**Response (Not Authenticated):**
```json
{
  "authenticated": false
}
```

### POST `/api/auth/logout`

Clears the authentication token and logs out the user.

**Response:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

## Authentication Flow

1. **Login Page** (`/auth/login`)
   - User enters email and password
   - Credentials are sent to `/api/auth/login`

2. **Login API** (`/api/auth/login`)
   - Verifies email exists in database
   - Checks if user account is active
   - Checks if account is locked (failed attempts)
   - Verifies password using bcryptjs
   - Checks if user has required roles (SUPER_ADMIN, HITL, ADMIN)
   - Creates JWT token with user info and roles
   - Sets secure HTTP-only cookie with token
   - Logs successful login to database

3. **Middleware Protection** (`middleware.js`)
   - Runs on every request except public routes
   - Verifies JWT token from cookie
   - Checks if user has required roles
   - Blocks access if not authenticated or unauthorized
   - Redirects to login page if unauthorized

4. **Protected Routes**
   - All routes except `/auth/login` and `/api/auth/*` are protected
   - Users must be authenticated with proper roles
   - User information is available in request headers for API routes

5. **Logout**
   - User clicks logout in navbar
   - `/api/auth/logout` is called
   - Authentication cookie is deleted
   - User is redirected to login page

## Security Features

### Password Security
- Passwords are hashed using bcryptjs with salt rounds 12
- Passwords are never stored in plain text
- Password comparison uses bcryptjs.compare() for safe comparison

### Token Security
- JWT tokens are created with HS256 algorithm
- Tokens expire after 24 hours
- Tokens are stored in HTTP-only cookies (not accessible from JavaScript)
- Tokens are transmitted over HTTPS in production

### Account Security
- Failed login attempts are tracked
- After 5 failed attempts, account is locked for 30 minutes
- Lock time is automatically enforced by the database
- Successful login resets failed attempt counter

### Access Control
- All routes require authentication middleware
- User roles are verified on every request
- Only SUPER_ADMIN, HITL, and ADMIN roles can access the app
- Role information is cryptographically signed in JWT

### Activity Logging
- All login attempts (successful and failed) are logged
- Failed attempts record the reason (invalid password, user not found, etc.)
- Logs are stored in the database for audit purposes
- Activity logs include IP address and user agent

## Roles

### SUPER_ADMIN
- Full system access including user management, system configuration
- Complete access to all features and data

### HITL (Human-In-The-Loop)
- Can review and approve/reject document processing results
- Can validate test results

### ADMIN
- Administrative access to internal tools
- Can manage users and view analytics
- Access to all admin features

### Other Roles (Not Allowed)
- ACCOUNTANT, CLIENT, USER: Cannot access this admin application
- Will see "You do not have permission to access this application" error

## Customization

### Change JWT Secret
Update `JWT_SECRET` in your environment variables:
```
JWT_SECRET=your-secure-random-string-here
```

### Change Token Expiration
Edit `app/api/auth/login/route.js`:
```javascript
.setExpirationTime("48h")  // Change from 24h to 48h
```

### Change Allowed Roles
Edit `middleware.js` and `app/api/auth/login/route.js`:
```javascript
const ALLOWED_ROLES = ["SUPER_ADMIN", "HITL", "ADMIN", "ACCOUNTANT"];
```

### Change Failed Login Lockout Policy
Edit `app/api/auth/login/route.js`:
```javascript
// Change max attempts and lockout duration
SELECT record_failed_login_attempt($1, 3, 60)  // 3 attempts, 60 minute lockout
```

## Troubleshooting

### Issue: "Invalid credentials" error
- Verify email exists and is correct (case-insensitive)
- Verify password is correct
- Check if user account is active in database

### Issue: "Account is locked"
- User has exceeded failed login attempts
- Account will automatically unlock after 30 minutes
- Or use database to unlock: `SELECT unlock_internal_user(user_id)`

### Issue: "You do not have permission to access this application"
- User doesn't have SUPER_ADMIN, HITL, or ADMIN role
- Assign required role using: `SELECT add_role_to_internal_user(user_id, 'SUPER_ADMIN')`

### Issue: Middleware not redirecting to login
- Check that `middleware.js` is in the root directory
- Verify `PUBLIC_ROUTES` array includes public routes
- Check browser console for any JavaScript errors

## Database Functions Used

The authentication system uses these database functions:

- `create_internal_user()`: Creates new internal user with roles
- `get_internal_user_by_email()`: Retrieves user by email
- `get_internal_user_roles()`: Gets user's assigned roles
- `record_failed_login_attempt()`: Records and locks accounts on failed attempts
- `update_internal_user_last_login()`: Updates last login timestamp
- `log_internal_login()`: Logs login attempts to activity log

## Example Usage

### Create users with the script:
```bash
# Create multiple users for testing
node scripts/create-admin.js superadmin@test.com "Super" "Admin" "password123" "SUPER_ADMIN"
node scripts/create-admin.js hitl@test.com "HITL" "User" "password456" "HITL"
node scripts/create-admin.js admin@test.com "Regular" "Admin" "password789" "ADMIN"
```

### Test the login:
1. Navigate to http://localhost:3000/auth/login
2. Enter credentials (e.g., superadmin@test.com / password123)
3. Click "Sign In"
4. You should be redirected to the home page
5. Click on your user avatar in the top-right to see the user menu
6. Click "Logout" to sign out

## Support

For issues or questions about the authentication system, refer to:
- Database schema: `/financedb/db/init-db.sql`
- API implementation: `/app/api/auth/*`
- Middleware logic: `/middleware.js`
