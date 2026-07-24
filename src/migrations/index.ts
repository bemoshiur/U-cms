import * as migration_20260724_195445_initial from './20260724_195445_initial';
import * as migration_20260724_204204_departments_and_codes from './20260724_204204_departments_and_codes';
import * as migration_20260724_205851_codes_compound_unique from './20260724_205851_codes_compound_unique';
import * as migration_20260724_212430_roles_and_admin_menus from './20260724_212430_roles_and_admin_menus';

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
    name: '20260724_212430_roles_and_admin_menus'
  },
];
