import { MissionExecutionService } from "./MissionExecutionService.js";
import { AutomationService } from "./AutomationService.js";
import { TerminalCommandPresetService } from "./TerminalCommandPresetService.js";
import { AudioSessionService } from "./AudioSessionService.js";
import { OperatorPreferenceService } from "./OperatorPreferenceService.js";
import { FCStateService } from "./FCStateService.js";
import { Mapping3DService } from "./Mapping3DService.js";

export const missionExecutionService = new MissionExecutionService();
export const automationService = new AutomationService();
export const mapping3DService = new Mapping3DService();
export const terminalCommandPresetService = new TerminalCommandPresetService();
export const audioSessionService = new AudioSessionService();
export const operatorPreferenceService = new OperatorPreferenceService();
export const fcStateService = new FCStateService();

export { MissionExecutionService, AutomationService, TerminalCommandPresetService, AudioSessionService, OperatorPreferenceService, FCStateService };
export type { MissionRunRecord, MissionRunStatus } from "./MissionExecutionService.js";
export type { AutomationRunRecord, AutomationRecipe } from "./AutomationService.js";
export type { AudioSessionState } from "./AudioSessionService.js";
export type { OperatorPreferences } from "./OperatorPreferenceService.js";
export type { FCAppliedState } from "./FCStateService.js";
