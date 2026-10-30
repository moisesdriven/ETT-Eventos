export type ActionState = {
  ok?: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** Valores a conservar: React 19 limpia el formulario al terminar la acción. */
  values?: Record<string, string>;
};

export const initialActionState: ActionState = {};
