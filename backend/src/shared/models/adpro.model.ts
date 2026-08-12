// Modelos del dominio de autenticación / ADPRO ERP.

export interface ADPROToken {
    access_token: string;
    token_type: string;
    expires_in: number;
    authorization_token?: string;
}

export interface Empresa {
    Id: number;
    Nombre: string;
    [key: string]: any;
}

export interface Sucursal {
    Id: number;
    Nombre: string;
    [key: string]: any;
}
