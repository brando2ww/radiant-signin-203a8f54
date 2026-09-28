export function validateCNPJ(cnpj: string | number | null | undefined): boolean {
  if (!cnpj) return false;
  const cleanCNPJ = String(cnpj).replace(/\D/g, '');
  
  if (cleanCNPJ.length !== 14) return false;
  if (/^(\d)\1+$/.test(cleanCNPJ)) return false;

  let sum = 0;
  let pos = 5;
  
  for (let i = 0; i < 12; i++) {
    sum += parseInt(cleanCNPJ.charAt(i)) * pos--;
    if (pos < 2) pos = 9;
  }
  
  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== parseInt(cleanCNPJ.charAt(12))) return false;

  sum = 0;
  pos = 6;
  
  for (let i = 0; i < 13; i++) {
    sum += parseInt(cleanCNPJ.charAt(i)) * pos--;
    if (pos < 2) pos = 9;
  }
  
  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  return result === parseInt(cleanCNPJ.charAt(13));
}

export function formatCNPJ(cnpj: string | number | null | undefined): string {
  if (!cnpj) return '';
  // String() porque CNPJ vindo de XML já chegou aqui como número mais de uma
  // vez, e replace em número derruba a tela inteira.
  const clean = String(cnpj).replace(/\D/g, '');
  return clean.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

export function validateNFeKey(key: string | null | undefined): boolean {
  if (!key) return false;
  return /^\d{44}$/.test(key);
}

export function formatNFeKey(key: string | number | null | undefined): string {
  if (!key) return '';
  return String(key).replace(/(\d{4})(?=\d)/g, '$1 ');
}
