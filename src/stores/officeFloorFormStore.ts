import { create } from "zustand";

import { DeskFormState } from "./types";

interface OfficeFloorFormState {
  floorId?: string;
  name: string;
  description: string;
  desks: DeskFormState[];
  imageUrl?: string;
  setName: (newName: string) => void;
  setDescription: (newDescription: string) => void;
  setDesks: (newDesks: DeskFormState[]) => void;
  setImageUrl: (newImageUrl: string | undefined) => void;
  setFloorId: (id: string | undefined) => void;
  hydrate: (payload: {
    floorId?: string;
    name?: string | null;
    description?: string | null;
    imageUrl?: string | null;
    desks?: DeskFormState[];
  }) => void;
  reset: () => void;
}

export const useOfficeFloorFormStore = create<OfficeFloorFormState>((set) => ({
  floorId: undefined,
  name: "",
  description: "",
  desks: [],
  setName: (newName) =>
    set((state) => {
      return { ...state, name: newName };
    }),
  setDescription: (newDescription) =>
    set((state) => {
      return { ...state, description: newDescription };
    }),
  setDesks: (newDesks) =>
    set((state) => {
      return { ...state, desks: newDesks };
    }),
  imageUrl: undefined,
  setImageUrl: (newImageUrl) =>
    set((state) => {
      return { ...state, imageUrl: newImageUrl };
    }),
  setFloorId: (id) =>
    set((state) => {
      return { ...state, floorId: id };
    }),
  hydrate: (payload) =>
    set((state) => {
      return {
        ...state,
        floorId: payload.floorId ?? state.floorId,
        name: payload.name ?? "",
        description: payload.description ?? "",
        imageUrl: payload.imageUrl ?? undefined,
        desks: payload.desks ?? [],
      };
    }),
  reset: () =>
    set({
      floorId: undefined,
      name: "",
      description: "",
      desks: [],
      imageUrl: undefined,
    }),
}));
