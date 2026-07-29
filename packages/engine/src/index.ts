// ANDAMIAJE: se elimina en la fase 1.
// La arista hacia @oa/domain es obligatoria: la regla `el-grafo-no-esta-vacio`
// del ruleset falla si desaparece, que es como detectamos un grafo vacío.
import { PACKAGE_ID as DOMAIN_ID } from "@oa/domain";

export const PACKAGE_ID = "@oa/engine" as const;
export const DEPENDS_ON = DOMAIN_ID;
