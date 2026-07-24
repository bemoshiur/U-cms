import * as migration_20260724_195445_initial from './20260724_195445_initial';

export const migrations = [
  {
    up: migration_20260724_195445_initial.up,
    down: migration_20260724_195445_initial.down,
    name: '20260724_195445_initial'
  },
];
