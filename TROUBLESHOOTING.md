# Troubleshooting Guide - Authentication System

## Issue 1: Database Connection Error `ECONNREFUSED 185.14.252.37:5005`

### Problem
```
Login error: Error: connect ECONNREFUSED 185.14.252.37:5005
```

This error means the application cannot connect to the database server.

### Solutions

#### 1. **Check Environment Variables**
Verify your `.env` or `.env.local` file has the correct database URL:

```bash
# Check if .env file exists
cat /home/vanshtomar/KTB/ManualResultAnalyzer/.env

# Should contain:
MAIN_FINANCE_DB_URL=postgresql://user:password@host:port/database
```

**Current configuration expects:**
- Host: `185.14.252.37`
- Port: `5005`
- Database: `financedb`

#### 2. **Test Database Connectivity**

```bash
# Test with psql (if PostgreSQL client is installed)
psql -h 185.14.252.37 -p 5005 -U financedb_user -d financedb

# Or test with curl/nc
nc -zv 185.14.252.37 5005
```

#### 3. **Common Causes & Fixes**

| Issue | Solution |
|-------|----------|
| Database server is down | Contact database administrator to verify server is running |
| Wrong host/port | Verify `MAIN_FINANCE_DB_URL` matches your database location |
| Network connectivity | Check firewall rules, VPN connection if required |
| Wrong credentials | Verify username, password, and database name |
| Database not initialized | Run `/financedb/db/init-db.sql` to initialize schema |

#### 4. **Quick Test Script**

Create a test file `scripts/test-db.js`:

```javascript
import { financeQuery } from "@/lib/financedb.js";

async function testConnection() {
  try {
    const result = await financeQuery("SELECT NOW() as current_time");
    console.log("✓ Database connection successful!");
    console.log("Current time:", result.rows[0].current_time);
  } catch (error) {
    console.error("✗ Database connection failed:");
    console.error(error.message);
    process.exit(1);
  }
}

testConnection();
```

Run it:
```bash
node --loader tsx scripts/test-db.js
```

---

## Issue 2: Cookies API Error in Next.js 16

### Problem
```
Error: Route "/api/auth/me" used `cookies().get`. `cookies()` returns a Promise 
and must be unwrapped with `await` or `React.use()` before accessing its properties.
```

### Solution
✅ **Already Fixed** - Updated all auth routes to use `await cookies()`:

- ✓ `/app/api/auth/login/route.js` - Uses `await cookies()`
- ✓ `/app/api/auth/logout/route.js` - Uses `await cookies()`
- ✓ `/app/api/auth/me/route.js` - Uses `await cookies()`

If you still see this error:
1. Clear `.next` build cache: `rm -rf .next`
2. Restart dev server: `npm run dev`

---

## Issue 3: Login Shows "Invalid Credentials"

### Causes & Solutions

#### A. User Doesn't Exist
```bash
# Create a new admin user
node scripts/create-admin.js admin@test.com "John" "Admin" "Password123" "SUPER_ADMIN"
```

#### B. Wrong Password
- Passwords are case-sensitive
- Verify you're typing the correct password
- Check that password has no extra spaces

#### C. User Account Not Active
Check in database:
```sql
SELECT internal_user_id, email, is_active, locked_until 
FROM internal_users 
WHERE email = 'admin@test.com';
```

If `is_active = false`:
```sql
SELECT reactivate_internal_user(user_id);
```

#### D. Account Locked (Too Many Failed Attempts)
If `locked_until` is in the future, the account is locked.

Wait for lockout period or unlock:
```sql
SELECT unlock_internal_user(user_id);
```

---

## Issue 4: "You do not have permission to access this application"

### Problem
User is authenticated but doesn't have the required roles.

### Solution
Check user's roles:
```sql
SELECT role_name FROM user_roles ur
JOIN roles r ON ur.role_id = r.role_id
WHERE ur.internal_user_id = (
  SELECT internal_user_id FROM internal_users WHERE email = 'user@test.com'
);
```

Assign required role:
```sql
SELECT add_role_to_internal_user(
  (SELECT internal_user_id FROM internal_users WHERE email = 'user@test.com'),
  'SUPER_ADMIN'
);
```

Valid roles for admin access:
- `SUPER_ADMIN` - Full system access
- `HITL` - Review and approve results
- `ADMIN` - Administrative access

---

## Issue 5: Login Redirect Loop

### Problem
After login, redirected back to login page repeatedly.

### Causes & Solutions

#### A. JWT Token Not Being Set
1. Check browser DevTools → Application → Cookies
2. Should see `auth_token` cookie set
3. If missing, middleware is not setting it properly

**Fix:**
```bash
rm -rf .next
npm run dev
```

#### B. JWT Secret Mismatch
Verify `.env` has `JWT_SECRET` set:
```bash
grep JWT_SECRET .env
```

If missing, add it:
```bash
echo "JWT_SECRET=your-random-secret-key-here" >> .env
```

#### C. Middleware Not Running
Verify `middleware.js` exists in root directory:
```bash
ls -la middleware.js
```

Should output: `-rw-r--r-- middleware.js`

---

## Issue 6: "Route "/api/auth/login" used cookies() but did not throw"

### Problem
Not actually an error, but a Next.js warning.

### Solution
This can occur if middleware or another part of the app is calling the endpoint. It's usually harmless but indicates:
- The endpoint is being called multiple times
- Refresh page or clear browser cache if experiencing issues

---

## Complete Setup Checklist

```bash
# 1. Install dependencies
npm install

# 2. Verify environment variables
echo "Checking .env..."
cat .env | grep -E "(MAIN_FINANCE_DB_URL|JWT_SECRET)"

# 3. Test database connection
psql -h 185.14.252.37 -p 5005 -U financedb_user -d financedb -c "SELECT 1"

# 4. Initialize database if needed
psql -h 185.14.252.37 -p 5005 -U financedb_user -d financedb < /path/to/init-db.sql

# 5. Create admin user
node scripts/create-admin.js admin@test.com "Admin" "User" "TestPass123" "SUPER_ADMIN"

# 6. Start dev server
npm run dev

# 7. Visit login page
# Open: http://localhost:3000/auth/login
# Login with: admin@test.com / TestPass123

# 8. Check if you're redirected to home page
# URL should change to: http://localhost:3000/
```

---

## Database Connection Test

### Using Node.js Script

Create `scripts/test-connection.js`:

```javascript
import pg from 'pg';

const { Pool } = pg;

async function testDB() {
  const pool = new Pool({
    connectionString: process.env.MAIN_FINANCE_DB_URL,
  });

  try {
    const result = await pool.query('SELECT version()');
    console.log('✓ Connected to database');
    console.log('PostgreSQL version:', result.rows[0].version);
    
    // Test if users table exists
    const usersCheck = await pool.query(
      "SELECT COUNT(*) FROM internal_users"
    );
    console.log('✓ internal_users table exists');
    console.log('  Users count:', usersCheck.rows[0].count);
    
  } catch (error) {
    console.error('✗ Database test failed');
    console.error(error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

testDB();
```

Run:
```bash
node scripts/test-connection.js
```

---

## Getting Help

### Check Logs
1. **Browser Console** (F12)
   - Network tab: Check `/api/auth/login` response
   - Console tab: Check for JavaScript errors

2. **Server Console** (where you ran `npm run dev`)
   - Look for error messages and stack traces
   - Check database connection errors

### Debug Queries
Add logging to see what's happening:

In `/app/api/auth/login/route.js`, add:
```javascript
console.log("Email:", email);
console.log("User found:", userResult.rows.length);
console.log("User roles:", user?.roles);
```

### Common Error Messages & Meanings

| Error | Meaning |
|-------|---------|
| `ECONNREFUSED` | Can't reach database server |
| `Invalid credentials` | Email not found OR password wrong |
| `Account is locked` | Too many failed attempts |
| `You do not have permission` | User doesn't have required roles |
| `Token verification error` | JWT secret mismatch or token expired |

---

## Quick Reference

### Database Commands

```sql
-- List all admin users
SELECT * FROM internal_users WHERE is_active = true;

-- Show user with roles
SELECT iu.*, STRING_AGG(r.role_name, ', ')
FROM internal_users iu
LEFT JOIN user_roles ur ON iu.internal_user_id = ur.internal_user_id
LEFT JOIN roles r ON ur.role_id = r.role_id
GROUP BY iu.internal_user_id;

-- Create user with role
SELECT create_internal_user('user@test.com', 'John', 'Doe', 'hashed_password', ARRAY['SUPER_ADMIN']);

-- Add role to user
SELECT add_role_to_internal_user(1, 'HITL');

-- Lock/unlock user
SELECT unlock_internal_user(1);

-- View login attempts
SELECT * FROM internal_activity_logs 
WHERE activity_type IN ('LOGIN', 'LOGIN_FAILED')
ORDER BY activity_timestamp DESC LIMIT 20;
```

### Environment Setup

```bash
# Create .env file
cat > .env << EOF
MAIN_FINANCE_DB_URL=postgresql://financedb_user:financedb_password_2026@185.14.252.37:5005/financedb
JWT_SECRET=your-super-secret-key-change-this-in-production
NODE_ENV=development
EOF

# Verify it
cat .env
```

---

## Support

For more information, see:
- `/AUTH.md` - Full authentication documentation
- `/IMPLEMENTATION_SUMMARY.md` - What was implemented
- `/app/api/auth/*` - API endpoint code
- `/middleware.js` - Route protection logic
