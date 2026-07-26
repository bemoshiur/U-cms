import * as migration_20260724_195445_initial from './20260724_195445_initial';
import * as migration_20260724_204204_departments_and_codes from './20260724_204204_departments_and_codes';
import * as migration_20260724_205851_codes_compound_unique from './20260724_205851_codes_compound_unique';
import * as migration_20260724_212430_roles_and_admin_menus from './20260724_212430_roles_and_admin_menus';
import * as migration_20260724_222829_task_1d_accounts from './20260724_222829_task_1d_accounts';
import * as migration_20260724_232634_task_2a_audit from './20260724_232634_task_2a_audit';
import * as migration_20260725_001909_task_2b_2fa from './20260725_001909_task_2b_2fa';
import * as migration_20260725_005333_task_2b_2fa_throttle from './20260725_005333_task_2b_2fa_throttle';
import * as migration_20260725_013239_task_2c_ip_access from './20260725_013239_task_2c_ip_access';
import * as migration_20260725_040144_task_3a_boards from './20260725_040144_task_3a_boards';
import * as migration_20260725_052833_task_3b_content from './20260725_052833_task_3b_content';
import * as migration_20260725_060319_task_3c_display from './20260725_060319_task_3c_display';
import * as migration_20260725_065611_task_3d_menus_content from './20260725_065611_task_3d_menus_content';
import * as migration_20260725_105046_task_4z_attachments from './20260725_105046_task_4z_attachments';
import * as migration_20260725_131049_task_4b_members from './20260725_131049_task_4b_members';
import * as migration_20260726_051201_task_4d_surveys from './20260726_051201_task_4d_surveys';
import * as migration_20260726_054751_task_4d_survey_dedup_unique from './20260726_054751_task_4d_survey_dedup_unique';

export const migrations = [
  {
    up: migration_20260724_195445_initial.up,
    down: migration_20260724_195445_initial.down,
    name: '20260724_195445_initial',
  },
  {
    up: migration_20260724_204204_departments_and_codes.up,
    down: migration_20260724_204204_departments_and_codes.down,
    name: '20260724_204204_departments_and_codes',
  },
  {
    up: migration_20260724_205851_codes_compound_unique.up,
    down: migration_20260724_205851_codes_compound_unique.down,
    name: '20260724_205851_codes_compound_unique',
  },
  {
    up: migration_20260724_212430_roles_and_admin_menus.up,
    down: migration_20260724_212430_roles_and_admin_menus.down,
    name: '20260724_212430_roles_and_admin_menus',
  },
  {
    up: migration_20260724_222829_task_1d_accounts.up,
    down: migration_20260724_222829_task_1d_accounts.down,
    name: '20260724_222829_task_1d_accounts',
  },
  {
    up: migration_20260724_232634_task_2a_audit.up,
    down: migration_20260724_232634_task_2a_audit.down,
    name: '20260724_232634_task_2a_audit',
  },
  {
    up: migration_20260725_001909_task_2b_2fa.up,
    down: migration_20260725_001909_task_2b_2fa.down,
    name: '20260725_001909_task_2b_2fa',
  },
  {
    up: migration_20260725_005333_task_2b_2fa_throttle.up,
    down: migration_20260725_005333_task_2b_2fa_throttle.down,
    name: '20260725_005333_task_2b_2fa_throttle',
  },
  {
    up: migration_20260725_013239_task_2c_ip_access.up,
    down: migration_20260725_013239_task_2c_ip_access.down,
    name: '20260725_013239_task_2c_ip_access',
  },
  {
    up: migration_20260725_040144_task_3a_boards.up,
    down: migration_20260725_040144_task_3a_boards.down,
    name: '20260725_040144_task_3a_boards',
  },
  {
    up: migration_20260725_052833_task_3b_content.up,
    down: migration_20260725_052833_task_3b_content.down,
    name: '20260725_052833_task_3b_content',
  },
  {
    up: migration_20260725_060319_task_3c_display.up,
    down: migration_20260725_060319_task_3c_display.down,
    name: '20260725_060319_task_3c_display',
  },
  {
    up: migration_20260725_065611_task_3d_menus_content.up,
    down: migration_20260725_065611_task_3d_menus_content.down,
    name: '20260725_065611_task_3d_menus_content',
  },
  {
    up: migration_20260725_105046_task_4z_attachments.up,
    down: migration_20260725_105046_task_4z_attachments.down,
    name: '20260725_105046_task_4z_attachments',
  },
  {
    up: migration_20260725_131049_task_4b_members.up,
    down: migration_20260725_131049_task_4b_members.down,
    name: '20260725_131049_task_4b_members',
  },
  {
    up: migration_20260726_051201_task_4d_surveys.up,
    down: migration_20260726_051201_task_4d_surveys.down,
    name: '20260726_051201_task_4d_surveys',
  },
  {
    up: migration_20260726_054751_task_4d_survey_dedup_unique.up,
    down: migration_20260726_054751_task_4d_survey_dedup_unique.down,
    name: '20260726_054751_task_4d_survey_dedup_unique'
  },
];
