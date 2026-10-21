<?php
require dirname(__DIR__, 2).'/reclaim-backend/vendor/autoload.php';
$app = require dirname(__DIR__, 2).'/reclaim-backend/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();
$db = Illuminate\Support\Facades\DB::connection();
if (app()->environment() !== 'testing'
    || config('database.connections.mysql.host') !== '127.0.0.1'
    || (int) config('database.connections.mysql.port') !== 3307
    || $db->getDatabaseName() !== 'reclaim_frontend_test'
    || $db->selectOne('SELECT DATABASE() AS name')->name !== 'reclaim_frontend_test') {
    throw new RuntimeException('Refusing to use a non-isolated verification database.');
}
if (($argv[1] ?? '') === 'seed') {
    $staff = App\Models\Staff::create(['full_name' => 'Verification Administrator']);
    App\Models\User::forceCreate([
        'name' => 'Verification Administrator', 'email' => 'admin@example.test',
        'password' => getenv('RECLAIM_TEST_PASSWORD'), 'staff_id' => $staff->staff_id,
        'is_account_admin' => true,
    ]);
    echo json_encode(['seeded' => true]);
} elseif (($argv[1] ?? '') === 'verification-url') {
    $user = App\Models\User::where('email', $argv[2])->firstOrFail();
    echo Illuminate\Support\Facades\URL::temporarySignedRoute('user.email.verify', now()->addMinutes(10), [
        'id' => $user->id, 'hash' => sha1($user->email),
    ]);
} elseif (($argv[1] ?? '') === 'clear-recovery-test-limits') {
    Illuminate\Support\Facades\Cache::store('database')->flush();
    echo json_encode(['cleared' => true]);
} elseif (($argv[1] ?? '') === 'recovery-code') {
    $email = $argv[2] ?? '';
    if (! str_ends_with($email, '@example.test')) {
        throw new RuntimeException('Recovery fixtures require a fictional email address.');
    }
    App\Models\User::where('email', $email)->firstOrFail();
    $db->table('password_reset_tokens')->updateOrInsert(['email' => $email], [
        'token' => Illuminate\Support\Facades\Hash::make(hash_hmac('sha256', '012345', (string) config('app.key'))),
        'created_at' => now(),
    ]);
    echo json_encode(['prepared' => true]);
} elseif (($argv[1] ?? '') === 'expire-sessions') {
    $user = App\Models\User::where('email', $argv[2])->firstOrFail();
    $count = $db->table('sessions')->where('user_id', $user->id)->update(['last_activity' => now()->subMinutes(config('session.lifetime') + 1)->timestamp]);
    echo json_encode(['expired' => $count]);
} else {
    throw new RuntimeException('Unknown verification operation.');
}
