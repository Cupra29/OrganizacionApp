# ADR-012: Contenedor único en PaaS con PostgreSQL gestionado
Estado: aceptado (2026-07-28)
Fecha: 2026-07-24

## Contexto

- Volumen esperado: decenas de usuarios al principio. Q1 se resolvió el 2026-07-27 como
  **SaaS multiusuario**, así que habrá usuarios reales distintos del desarrollador.
- Sin picos de tráfico: el uso es humano y esporádico (entrevista, revisión semanal, alguna
  replanificación).
- El motor corre en proceso, síncrono, en cientos de milisegundos.
- Equipo pequeño: el tiempo dedicado a infraestructura no se dedica al producto.
- **Los datos son el activo crítico.** Perder los planes y el historial de un usuario es
  irreparable; que el servicio esté caído dos horas, no.

## Decisión

**Lo más simple que cumple los requisitos:**

- **API**: un contenedor Docker en una PaaS (Fly.io o Railway). Escalado vertical; una sola
  instancia al principio.
- **Base de datos**: PostgreSQL gestionado con **copias de seguridad automáticas diarias y
  recuperación a un punto en el tiempo**. No autogestionado. **Rotación de copias a 30 días**,
  que es el plazo en que se completa un borrado a petición ([ADR-014]).
- **Región**: la más cercana al mercado inicial esperado. Q8 se resolvió el 2026-07-27 con
  RGPD como techo, y **RGPD no obliga a alojar en la UE**: exige base legal, minimización,
  derechos ejercitables y contratos con los encargados, todo independiente de la ubicación.
  Las transferencias se cubren con las cláusulas contractuales del proveedor. Se revisará solo
  si aparece un requisito explícito de residencia de datos.
- **Contrato de encargado del tratamiento firmado** con el proveedor de PaaS, el de base de
  datos y el de correo. Es requisito, no trámite opcional.
- **Web**: estáticos en CDN (Cloudflare Pages o el mismo proveedor).
- **Migraciones**: paso previo del despliegue, con reversión documentada. Nunca automáticas al
  arrancar la aplicación.
- **Configuración**: variables de entorno validadas con Zod al arrancar; el proceso **falla al
  iniciar** si falta una. Sin secretos en el repositorio.
- **Entornos**: producción y previsualización por rama. Sin entorno de staging permanente.
- **Trabajo programado**: un único job diario (detección de compromisos expirados), ejecutado
  con el cron de la plataforma, no con un planificador dentro del proceso.

**Lo que explícitamente no se despliega:** Kubernetes, colas de mensajes, Redis, réplicas de
lectura, malla de servicios, ni observabilidad distribuida.

## Alternativas consideradas

**Kubernetes.**
En contra: complejidad operativa desproporcionada para un servicio y una base de datos. Se
descarta sin más discusión; sería la decisión que más tiempo consumiría a cambio de nada.

**Serverless (Lambda, Cloudflare Workers).**
A favor: coste cercano a cero en reposo y escalado automático. En contra: arranques en frío en
un endpoint que ejecuta el motor; gestión de conexiones a PostgreSQL que exige un pooler
(PgBouncer, Neon) y añade una pieza; y límites de tiempo de ejecución que rozan el peor caso
del motor. La ventaja principal —escalar a cero— no aporta valor con un tráfico bajo pero
constante. Se descarta.

**VPS autogestionado con Docker Compose.**
A favor: máximo control y coste más bajo. En contra: **hay que operar PostgreSQL a mano**,
incluidas copias de seguridad, parches y actualizaciones de versión. Dado que los datos son el
activo crítico y el equipo es pequeño, delegar la base de datos es la mejor relación
riesgo/esfuerzo de todo el despliegue. Se descarta.

**Plataforma integrada tipo Supabase o Firebase.**
A favor: base de datos, autenticación y almacenamiento en un paquete; arranque rapidísimo. En
contra: el modelo necesita `btree_gist`, constraints de exclusión y migraciones SQL propias
([ADR-002]); estas plataformas empujan hacia sus abstracciones y hacia lógica en el cliente,
que es justo lo que el guardrail nº4 prohíbe. Se descarta por acoplamiento.

**Ejecutar el motor en un servicio separado.**
Descartado en [01 §7](../01-arquitectura.md): un solo consumidor, sin necesidad de escalado
independiente, latencia baja. Se puede extraer después porque es una función pura.

## Consecuencias

**Lo que ganamos**
- Despliegue en minutos y reversión trivial.
- Copias de seguridad y parches de la base de datos delegados a quien sabe hacerlo.
- Coste bajo y predecible.
- Casi nada de tiempo dedicado a infraestructura.

**Lo que cuesta**
- **Una sola instancia significa que un despliegue implica una breve interrupción** y que un
  fallo del proceso deja el servicio caído hasta que se reinicie. Aceptable para el perfil de
  uso; deja de serlo en cuanto haya usuarios que dependan del servicio a diario.
- Dependencia del proveedor de PaaS. Mitigada porque todo va en un Dockerfile estándar y
  PostgreSQL es portable: migrar es un fin de semana, no un proyecto.
- Sin staging permanente, algunos problemas solo aparecerán en producción. Mitigado con
  entornos de previsualización por rama.
- Escalar exigirá revisar esta decisión. Se asume: es reversible.

**Lo que queda condicionado**
- La generación de plan es **síncrona** ([01 §7](../01-arquitectura.md)). Si el p95 superara
  los 2 s habría que introducir trabajos asíncronos, y eso sí exigiría una pieza más.
- Fase 9: la restauración desde copia de seguridad debe **probarse de verdad**, no solo
  configurarse. Una copia no probada no es una copia.
- Con Q1 resuelta como SaaS multiusuario, la simplificación a "una máquina o ejecución local"
  queda descartada, y **la copia de seguridad con restauración probada pasa a ser
  innegociable**: los datos que se pierdan ya no serán solo los del desarrollador.
- Q8 se resolvió el 2026-07-27 (RGPD como techo, ver [ADR-014]). La consecuencia operativa
  aquí es la rotación de copias a 30 días y el contrato de encargado con cada proveedor. La
  región se elige por latencia, no por cumplimiento.

[ADR-014]: ./ADR-014-cumplimiento-rgpd.md

[ADR-002]: ./ADR-002-persistencia-postgresql.md
