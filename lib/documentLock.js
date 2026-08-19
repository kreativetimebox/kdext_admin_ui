// lib/documentLock.js
// Document locking & concurrency control.
// Ensures that when a document is opened by one user / tab on /view/[id],
// other users or tabs cannot open it simultaneously.

const LOCK_TIMEOUT_MS = 10 * 1000; // 10 seconds without heartbeat = lock expires immediately

if (!globalThis.__documentLocks) {
  globalThis.__documentLocks = new Map();
}

const locks = globalThis.__documentLocks;

function cleanExpired() {
  const now = Date.now();
  for (const [key, lock] of locks.entries()) {
    if (now - lock.lastHeartbeat > LOCK_TIMEOUT_MS) {
      locks.delete(key);
    }
  }
}

/**
 * Attempt to acquire a lock on a document for a user & tab.
 */
export function acquireDocumentLock(docId, user, tabId) {
  if (!docId || !user) return { success: false, error: "Invalid docId or user" };
  cleanExpired();

  const key = String(docId);
  const now = Date.now();
  const existing = locks.get(key);

  const userId = String(user.userId || user.id || user.email);
  const userEmail = user.email || "";
  const userName = user.name || user.firstName || user.email || "Another reviewer";

  if (existing) {
    // If it's the exact same tab/session, allow re-acquisition & refresh heartbeat
    const sameTab = tabId && existing.tabId === tabId;
    if (sameTab) {
      existing.lastHeartbeat = now;
      return { success: true, isOwner: true, lock: existing };
    }

    // Locked by another tab or another user
    return {
      success: false,
      isOwner: false,
      lockedBy: {
        userId: existing.userId,
        userEmail: existing.userEmail,
        userName: existing.userName,
        lockedAt: existing.lockedAt,
      },
    };
  }

  // Acquire new lock
  const newLock = {
    docId: key,
    tabId: tabId || Math.random().toString(36).substring(2),
    userId,
    userEmail,
    userName,
    lockedAt: new Date().toISOString(),
    lastHeartbeat: now,
  };
  locks.set(key, newLock);

  return { success: true, isOwner: true, lock: newLock };
}

/**
 * Send heartbeat to keep the lock alive while user is viewing the document.
 */
export function heartbeatDocumentLock(docId, user, tabId) {
  if (!docId || !user) return { success: false };
  cleanExpired();

  const key = String(docId);
  const existing = locks.get(key);
  if (!existing) {
    return acquireDocumentLock(docId, user, tabId);
  }

  const sameTab = tabId && existing.tabId === tabId;
  const sameUser =
    String(existing.userId) === String(user.userId || user.id || user.email) ||
    (user.email && existing.userEmail && existing.userEmail.toLowerCase() === user.email.toLowerCase());

  if (sameTab || sameUser) {
    existing.lastHeartbeat = Date.now();
    return { success: true, isOwner: true, lock: existing };
  }

  return {
    success: false,
    isOwner: false,
    lockedBy: {
      userId: existing.userId,
      userEmail: existing.userEmail,
      userName: existing.userName,
      lockedAt: existing.lockedAt,
    },
  };
}

/**
 * Release lock when user leaves /view/[id].
 */
export function releaseDocumentLock(docId, user, tabId) {
  if (!docId) return { success: true };
  const key = String(docId);
  const existing = locks.get(key);
  if (!existing) return { success: true };

  if (tabId && existing.tabId === tabId) {
    locks.delete(key);
    return { success: true };
  }

  if (user) {
    const userId = String(user.userId || user.id || user.email);
    const userEmail = user.email || "";
    const sameUser =
      String(existing.userId) === userId ||
      (userEmail && existing.userEmail && existing.userEmail.toLowerCase() === userEmail.toLowerCase()) ||
      user.roles?.includes("SUPER_ADMIN");

    if (sameUser) {
      locks.delete(key);
      return { success: true };
    }
  } else {
    locks.delete(key);
  }
  return { success: true };
}

/**
 * Get all active locks for list pages.
 */
export function getActiveDocumentLocks() {
  cleanExpired();
  const res = {};
  for (const [key, lock] of locks.entries()) {
    res[key] = {
      tabId: lock.tabId,
      userId: lock.userId,
      userEmail: lock.userEmail,
      userName: lock.userName,
      lockedAt: lock.lockedAt,
    };
  }
  return res;
}
