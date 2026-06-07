/**
 * Overlay signals — visibility and height state.
 */
import { createSignal } from "solid-js";

/** Whether the overlay window is currently visible. */
export const [overlayVisible, setOverlayVisible] = createSignal<boolean>(true);

/** Current UI height state of the overlay content. */
export type OverlayHeightState = "collapsed" | "streaming" | "completed";
export const [heightState, setHeightState] = createSignal<OverlayHeightState>("collapsed");

/** Whether settings panel is open. */
export const [settingsOpen, setSettingsOpen] = createSignal<boolean>(false);
