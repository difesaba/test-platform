/** Contrato uniforme de retorno de toda la capa de servicios. */
export interface OperationResult<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}
