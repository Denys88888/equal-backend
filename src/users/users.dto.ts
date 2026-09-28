import { IsBoolean, IsOptional } from 'class-validator';

/**
 * Settings → Privacy / Notifications. Every field is optional so the app can
 * save one toggle at a time; the global ValidationPipe (whitelist:true) strips
 * anything not declared here, so this route cannot touch any other column.
 */
export class UpdateSettingsDto {
  @IsOptional() @IsBoolean() ghostMode?: boolean;
  @IsOptional() @IsBoolean() verifiedOnly?: boolean;
  @IsOptional() @IsBoolean() notifyMatches?: boolean;
  @IsOptional() @IsBoolean() notifyMessages?: boolean;
  @IsOptional() @IsBoolean() notifyEvents?: boolean;
  @IsOptional() @IsBoolean() notifyClubs?: boolean;
}

export const SETTINGS_SELECT = {
  ghostMode: true,
  verifiedOnly: true,
  notifyMatches: true,
  notifyMessages: true,
  notifyEvents: true,
  notifyClubs: true,
} as const;
