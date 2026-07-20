import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { parseEnvironment } from '../config/env.schema.js';
import { UserSchema } from './schemas/user.schema.js';

function seedPassword(): string {
  const flag = process.argv.find((argument) => argument.startsWith('--password='));
  const password = flag?.slice('--password='.length) ?? process.env['DEMO_SEED_PASSWORD'];
  if (password === undefined || password.length < 12)
    throw new Error('Provide DEMO_SEED_PASSWORD or --password=<at-least-12-characters>.');
  return password;
}
async function run(): Promise<void> {
  const env = parseEnvironment(process.env);
  if (!env.DEMO_MODE) throw new Error('Demo seeding is disabled unless DEMO_MODE=true.');
  const password = seedPassword();
  await mongoose.connect(env.MONGODB_URI, { dbName: env.MONGODB_DB_NAME });
  const UserModel = mongoose.model('User', UserSchema);
  const passwordHash = await bcrypt.hash(password, 12);
  await Promise.all([
    UserModel.updateOne(
      { email: 'demo-admin@marxmatrix.local' },
      {
        $set: {
          email: 'demo-admin@marxmatrix.local',
          displayName: 'Quản trị viên demo',
          role: 'admin',
          passwordHash
        }
      },
      { upsert: true }
    ),
    UserModel.updateOne(
      { email: 'demo-student@marxmatrix.local' },
      {
        $set: {
          email: 'demo-student@marxmatrix.local',
          displayName: 'Sinh viên demo',
          role: 'student',
          passwordHash
        }
      },
      { upsert: true }
    )
  ]);
  process.stdout.write(
    'Created or updated demo-admin@marxmatrix.local and demo-student@marxmatrix.local. Password supplied at runtime; do not save it.\n'
  );
  await mongoose.disconnect();
}
void run().catch(async (error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Demo seed failed.'}\n`);
  await mongoose.disconnect();
  process.exitCode = 1;
});
