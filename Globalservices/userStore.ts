import { create } from 'zustand';

export type UserData = {
  uid: string;
  email?: string | null;
  isAdmin?: boolean;
  [key: string]: unknown;
};

type UserStoreState = {
  user: UserData | null;
  setUser: (user: UserData | null) => void;
  clearUser: () => void;
};

export const useUserStore = create<UserStoreState>((set: (partial: Partial<UserStoreState>) => void) => ({
  user: null,
  setUser: (user: UserData | null) => set({ user }),
  clearUser: () => set({ user: null }),
}));
