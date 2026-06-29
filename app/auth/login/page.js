"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { AlertCircle, Lock, Mail, Loader2, LogIn, Eye, EyeOff } from "lucide-react";
import toast from "react-hot-toast";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  // Check if user is already authenticated
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await axios.get("/api/auth/me");
        if (res.data.authenticated) {
          router.push("/");
        }
      } catch (err) {
        // Not authenticated, continue
      } finally {
        setCheckingAuth(false);
      }
    };
    checkAuth();
  }, [router]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await axios.post("/api/auth/login", { email, password });

      if (res.data.success) {
        toast.success("Login successful!");
        router.push("/");
      }
    } catch (err) {
      const errorMessage =
        err.response?.data?.error || "An error occurred during login";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          background: "var(--background)",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <Loader2
            size={32}
            style={{
              animation: "spin 1s linear infinite",
              color: "var(--accent)",
              margin: "0 auto 16px",
            }}
          />
          <p style={{ color: "var(--text-muted)" }}>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "var(--background)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        className="login-shell"
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: 1120,
          padding: "48px 32px",
          display: "grid",
          gridTemplateColumns: "minmax(280px, 1fr) minmax(360px, 520px)",
          gap: 56,
          alignItems: "center",
        }}
      >
        {/* Header */}
        <div style={{ color: "#fff", minWidth: 0 }}>
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: 18,
              background: "rgba(255,255,255,0.14)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 0 24px",
              boxShadow: "var(--shadow-md)",
              border: "1px solid var(--panel-border)",
            }}
          >
            <Lock size={28} color="#fff" />
          </div>
          <h1
            style={{
              fontSize: "clamp(2.3rem, 5vw, 4.4rem)",
              fontWeight: 800,
              color: "#fff",
              margin: "0 0 18px",
              lineHeight: 1.03,
              fontFamily: "Georgia, 'Times New Roman', serif",
            }}
          >
            Welcome To DexAI
          </h1>
          <p
            style={{
              fontSize: "clamp(1rem, 2vw, 1.35rem)",
              color: "rgba(255,255,255,0.92)",
              margin: 0,
              lineHeight: 1.5,
              fontWeight: 700,
              maxWidth: 540,
            }}
          >
            Smart Accounting for Accountants & Business Owners
          </p>
        </div>

        {/* Form Card */}
        <div
          style={{
            background: "var(--panel-bg)",
            border: "1px solid var(--panel-border)",
            borderRadius: 34,
            padding: "44px 42px",
            boxShadow: "var(--shadow-lg)",
            backdropFilter: "blur(18px)",
          }}
        >
          <h2
            style={{
              fontSize: 28,
              fontWeight: 800,
              color: "#fff",
              margin: "0 0 28px",
              fontFamily: "Georgia, 'Times New Roman', serif",
            }}
          >
            Welcome Back
          </h2>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Email Field */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "rgba(255,255,255,0.86)",
                  marginBottom: 8,
                }}
              >
                Email Address
              </label>
              <div style={{ position: "relative" }}>
                <Mail
                  size={16}
                  style={{
                    position: "absolute",
                    left: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--text-muted)",
                  }}
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@company.com"
                  required
                  style={{
                    width: "100%",
                    padding: "11px 16px 11px 40px",
                    background: "var(--input-bg)",
                    border: "1px solid var(--input-border)",
                    borderRadius: 10,
                    fontSize: 14,
                    color: "var(--foreground)",
                    outline: "none",
                    transition: "all 0.2s ease",
                    boxSizing: "border-box",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#fff";
                    e.target.style.boxShadow = "0 0 0 3px rgba(255,255,255,0.12)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "var(--input-border)";
                    e.target.style.boxShadow = "none";
                  }}
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "rgba(255,255,255,0.86)",
                  marginBottom: 8,
                }}
              >
                Password
              </label>
              <div style={{ position: "relative" }}>
                <Lock
                  size={16}
                  style={{
                    position: "absolute",
                    left: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--text-muted)",
                    pointerEvents: "none",
                  }}
                />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={{
                    width: "100%",
                    padding: "11px 40px 11px 40px",
                    background: "var(--input-bg)",
                    border: "1px solid var(--input-border)",
                    borderRadius: 10,
                    fontSize: 14,
                    color: "var(--foreground)",
                    outline: "none",
                    transition: "all 0.2s ease",
                    boxSizing: "border-box",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "#fff";
                    e.target.style.boxShadow = "0 0 0 3px rgba(255,255,255,0.12)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "var(--input-border)";
                    e.target.style.boxShadow = "none";
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--text-muted)",
                    transition: "color 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "var(--foreground)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "var(--text-muted)";
                  }}
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 12,
                  padding: "12px 14px",
                  background: "var(--danger-bg)",
                  border: "1px solid rgba(255,255,255,0.22)",
                  borderRadius: 8,
                }}
              >
                <AlertCircle
                  size={16}
                  style={{
                    color: "var(--danger-color)",
                    flexShrink: 0,
                    marginTop: 2,
                  }}
                />
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    color: "var(--danger-color)",
                    lineHeight: 1.4,
                  }}
                >
                  {error}
                </p>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: "11px 16px",
                background: loading
                  ? "var(--text-muted)"
                  : "rgba(255,255,255,0.18)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.18)",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                transition: "all 0.2s ease",
                opacity: loading ? 0.7 : 1,
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.target.style.boxShadow = "0 10px 30px rgba(20,14,53,0.26)";
                  e.target.style.background = "rgba(255,255,255,0.26)";
                  e.target.style.transform = "translateY(-2px)";
                }
              }}
              onMouseLeave={(e) => {
                e.target.style.boxShadow = "none";
                e.target.style.background = loading ? "var(--text-muted)" : "rgba(255,255,255,0.18)";
                e.target.style.transform = "translateY(0)";
              }}
            >
              {loading ? (
                <>
                  <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn size={16} />
                  Sign In
                </>
              )}
            </button>
          </form>
        </div>

      </div>

      <style>{`
        @media (max-width: 820px) {
          .login-shell {
            grid-template-columns: 1fr !important;
            gap: 28px !important;
            padding: 32px 18px !important;
          }
          .login-shell > div:last-child {
            padding: 32px 22px !important;
            border-radius: 24px !important;
          }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
