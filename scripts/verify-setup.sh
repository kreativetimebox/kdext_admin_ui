#!/bin/bash

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "════════════════════════════════════════════════════════════════"
echo "  Manual Result Analyzer - Authentication Setup Verification"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
  echo -e "${RED}✗ Not in the correct directory${NC}"
  echo "  Please run this script from the ManualResultAnalyzer root directory"
  exit 1
fi

# Track results
PASSED=0
FAILED=0

# Helper functions
check_file() {
  if [ -f "$1" ]; then
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED++))
  else
    echo -e "${RED}✗${NC} $1"
    ((FAILED++))
  fi
}

check_dir() {
  if [ -d "$1" ]; then
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED++))
  else
    echo -e "${RED}✗${NC} $1"
    ((FAILED++))
  fi
}

check_package() {
  if npm list "$1" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Package '$1' is installed"
    ((PASSED++))
  else
    echo -e "${RED}✗${NC} Package '$1' is NOT installed"
    ((FAILED++))
  fi
}

echo "1. Checking API Routes..."
check_file "app/api/auth/login/route.js"
check_file "app/api/auth/logout/route.js"
check_file "app/api/auth/me/route.js"
echo ""

echo "2. Checking UI Components..."
check_file "app/auth/login/page.js"
check_dir "app/auth/login"
echo ""

echo "3. Checking Middleware..."
check_file "middleware.js"
echo ""

echo "4. Checking Libraries..."
check_file "lib/useAuth.js"
check_file "lib/financedb.js"
check_file "lib/dexaidb.js"
echo ""

echo "5. Checking Components..."
check_file "components/Navbar/Navbar.jsx"
echo ""

echo "6. Checking Scripts..."
check_file "scripts/create-admin.js"
echo ""

echo "7. Checking Documentation..."
check_file "AUTH.md"
check_file "IMPLEMENTATION_SUMMARY.md"
echo ""

echo "8. Checking Dependencies..."
check_package "bcryptjs"
check_package "jose"
check_package "pg"
check_package "axios"
echo ""

echo "9. Checking Environment..."
if [ -f ".env" ] || [ -f ".env.local" ]; then
  echo -e "${GREEN}✓${NC} Environment file exists"
  ((PASSED++))

  if grep -q "MAIN_FINANCE_DB_URL" .env* 2>/dev/null; then
    echo -e "${GREEN}✓${NC} MAIN_FINANCE_DB_URL is configured"
    ((PASSED++))
  else
    echo -e "${YELLOW}⚠${NC} MAIN_FINANCE_DB_URL not found in .env"
    ((FAILED++))
  fi
else
  echo -e "${YELLOW}⚠${NC} No .env file found"
  echo "  Make sure to create .env with MAIN_FINANCE_DB_URL and JWT_SECRET"
  ((FAILED++))
fi
echo ""

echo "10. Checking Next.js Configuration..."
if grep -q "serverExternalPackages" next.config.mjs; then
  echo -e "${GREEN}✓${NC} next.config.mjs has serverExternalPackages"
  ((PASSED++))
else
  echo -e "${YELLOW}⚠${NC} next.config.mjs might need serverExternalPackages configuration"
fi
echo ""

# Summary
echo "════════════════════════════════════════════════════════════════"
echo "  Summary"
echo "════════════════════════════════════════════════════════════════"
echo -e "  ${GREEN}Passed: $PASSED${NC}"
echo -e "  ${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ All checks passed! Setup is complete.${NC}"
  echo ""
  echo "Next steps:"
  echo "  1. Ensure MAIN_FINANCE_DB_URL and JWT_SECRET are in .env"
  echo "  2. Create an admin user:"
  echo "     node scripts/create-admin.js admin@company.com 'John' 'Admin' 'password123' 'SUPER_ADMIN'"
  echo "  3. Start the dev server:"
  echo "     npm run dev"
  echo "  4. Visit http://localhost:3000/auth/login"
  exit 0
else
  echo -e "${RED}✗ Some checks failed. Please review the issues above.${NC}"
  exit 1
fi
