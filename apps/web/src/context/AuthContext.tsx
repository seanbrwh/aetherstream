import React, { createContext, useContext, useState, useEffect } from "react";

export interface UserProfile {
  id: string;
  email?: string;
  username: string;
  displayName?: string | null;
  callsign?: string | null;
  role?: string | null;
}

interface AuthContextType {
  token: string | null;
  user: UserProfile | null;
  login: (token: string, user: UserProfile) => void;
  logout: () => void;
  updateUserContext: (updatedUser: Partial<UserProfile>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("aether_token"));
  const [user, setUser] = useState<UserProfile | null>(() => {
    const savedUser = localStorage.getItem("aether_user");
    return savedUser ? JSON.parse(savedUser) : null;
  });

  useEffect(() => {
    if (token) {
      localStorage.setItem("aether_token", token);
    } else {
      localStorage.removeItem("aether_token");
    }
  }, [token]);

  useEffect(() => {
    if (user) {
      localStorage.setItem("aether_user", JSON.stringify(user));
    } else {
      localStorage.removeItem("aether_user");
    }
  }, [user]);

  const login = (newToken: string, newUser: UserProfile) => {
    setToken(newToken);
    setUser(newUser);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("aether_token");
    localStorage.removeItem("aether_user");
  };

  const updateUserContext = (updatedUser: Partial<UserProfile>) => {
    setUser((prev) => {
      if (!prev) return null;
      return { ...prev, ...updatedUser };
    });
  };

  return (
    <AuthContext.Provider value={{ token, user, login, logout, updateUserContext }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
