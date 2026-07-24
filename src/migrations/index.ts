import * as migration_20260724_195445_initial from './20260724_195445_initial';
import * as migration_20260724_204204_departments_and_codes from './20260724_204204_departments_and_codes';

export const migrations = [
  {
    up: migration_20260724_195445_initial.up,
    down: migration_20260724_195445_initial.down,
    name: '20260724_195445_initial',
  },
  {
    up: migration_20260724_204204_departments_and_codes.up,
    down: migration_20260724_204204_departments_and_codes.down,
    name: '20260724_204204_departments_and_codes'
  },
];
