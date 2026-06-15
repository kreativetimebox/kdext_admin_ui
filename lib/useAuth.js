import { useState, useEffect, useCallback } from "react";
import axios from "axios";

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  const checkAuth = useCallback(async () => {
    try {
      const res = await axios.get("/api/auth/me");
      if (res.data.authenticated) {
        setUser(res.data.user);
        setAuthenticated(true);
      } else {
        setUser(null);
        setAuthenticated(false);
      }
    } catch (error) {
      setUser(null);
      setAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const logout = useCallback(async () => {
    try {
      await axios.post("/api/auth/logout");
      setUser(null);
      setAuthenticated(false);
    } catch (error) {
      console.error("Logout error:", error);
    }
  }, []);

  return { user, loading, authenticated, logout, checkAuth };
}
