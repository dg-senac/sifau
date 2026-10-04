// Configuração local do administrador
// Estas credenciais são verificadas localmente sem depender do Supabase

export const ADMIN_CREDENTIALS = {
  email: 'douglasadmin@sifau.com',
  // senha forte: 8 caracteres, incluindo letras maiúsculas, minúsculas, números e símbolos
  password: 'Adm1n$tr0ngP@ssw0rd!',
} as const;

export function isAdminCredentials(email: string, password: string): boolean {
  return (
    email.toLowerCase() === ADMIN_CREDENTIALS.email.toLowerCase() &&
    password === ADMIN_CREDENTIALS.password
  );
}