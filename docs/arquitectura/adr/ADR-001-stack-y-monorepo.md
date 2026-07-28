# ADR-001: TypeScript de extremo a extremo en un monorepo pnpm
Estado: aceptado (2026-07-28)
Fecha: 2026-07-24

## Contexto

Proyecto greenfield sin restricciones heredadas. Las fuerzas relevantes:

- El corazón del producto es un **motor algorítmico** con reglas densas que hay que probar de
  forma determinista y exhaustiva.
- Hay una **interfaz rica** (calendario, entrevista progresiva, visualización de diffs).
- Los tipos del dominio son complejos y **se comparten** entre motor, API e interfaz. Una
  divergencia entre ellos sería una fuente constante de bugs.
- **Una sola persona construye el proyecto, sin plazo externo** (confirmado el 2026-07-27 al
  resolverse Q12). Cada tecnología añadida se paga en atención, no solo en configuración.
  **La disponibilidad de horas sigue sin confirmarse y no se asume en ninguna dirección**;
  ver la revisión de la §5.
- No hay requisitos de rendimiento numérico: el algoritmo es combinatorio ligero sobre
  decenas de bloques, no cálculo intensivo.

## Decisión

**TypeScript en modo `strict` en todo el stack, en un monorepo pnpm workspaces**, con el
motor y la aritmética temporal en paquetes puros y separados de las aplicaciones.

- Backend: **Fastify**. Frontend: **React + Vite** (SPA).
- Validación y tipos compartidos: **Zod** en `packages/contracts`, fuente única de verdad.
- Tests: **Vitest** + **fast-check** (property-based) + **Testcontainers** + **Playwright**.
- Lint y formato: **Biome** (una herramienta en lugar de ESLint + Prettier).
- Frontera arquitectónica verificada en CI con **dependency-cruiser**.

## Alternativas consideradas

**Next.js como aplicación fullstack única.**
A favor: menos piezas, un solo despliegue, buena ergonomía para un desarrollador solo — es la
alternativa más seria. En contra: la aplicación está **autenticada al 100 %** y es un panel de
control, así que el renderizado en servidor aporta poco; y acopla el ciclo de vida del API al
del frontend, cuando el API tiene que servir además feeds `.ics` públicos por token con
cabeceras de caché propias. Se descartó inicialmente por margen estrecho, y **se reexaminó y
confirmó el 2026-07-27** cuando el antecedente "una persona sola" pasó de supuesto a hecho.
Ver §5.

**Python (o Go, o Rust) para el motor, TypeScript para el resto.**
A favor: Python tiene mejores bibliotecas de optimización si el motor evolucionara hacia un
solver. En contra: dos lenguajes, dos modelos de tipos y una frontera de serialización
justo en el punto donde los tipos del dominio son más ricos; los tipos compartidos —que son
la ventaja principal de este stack— desaparecen. Además, el [ADR-004] descarta el enfoque de
solver, que era la única razón fuerte para Python. Se descarta.

**Monorepo con Nx o Turborepo.**
A favor: caché de builds y orquestación. En contra: para 6 paquetes y una persona, pnpm
workspaces con scripts es suficiente y no tiene curva. Se descarta por
desproporción; se puede añadir después sin cambiar la estructura.

**Polirepo (motor, API y web separados).**
En contra: cambios que cruzan los tres serían tres PRs coordinados en la fase de mayor
iteración. Se descarta.

**ESLint + Prettier.**
Se descarta a favor de Biome por velocidad y por una sola configuración. Riesgo asumido:
ecosistema de plugins más pequeño. Si hiciera falta una regla que Biome no tiene, volver a
ESLint es media jornada.

## Consecuencias

**Lo que ganamos**
- Un tipo de dominio se define una vez y lo usan motor, API e interfaz.
- El motor y el paquete temporal quedan aislados y probables sin infraestructura: los tests
  del núcleo corren en segundos, sin Docker.
- Una sola cadena de herramientas: un `pnpm verify` cubre todo.

**Lo que cuesta**
- TypeScript es peor que un lenguaje con tipos algebraicos reales para modelar un dominio
  como este. Se compensa con uniones discriminadas y Zod, pero hay fricción.
- El monorepo exige disciplina de fronteras; sin `dependency-cruiser` en CI se degradaría en
  meses. Esa herramienta no es opcional.
- Dos artefactos de despliegue en lugar de uno.

**Lo que queda condicionado**
- La estructura de paquetes de [01 §6](../01-arquitectura.md) y la regla de dependencias.
- El motor puede extraerse a un servicio propio más adelante **precisamente porque** es un
  paquete puro sin I/O ([ADR-013]).

## 5. Revisión del 2026-07-27 — decisión firme tras resolverse Q12

Q12 confirmó **una sola persona, sin plazo externo**. Eso convierte en hecho el antecedente
del argumento más fuerte a favor de Next.js ("menos piezas para quien trabaja solo"), así que
la decisión se reexaminó en lugar de ratificarse por inercia.

**Se mantiene Fastify + React/Vite.** Tres razones concretas:

1. **"Menos piezas" aplica a la parte minoritaria del trabajo.** Las fases 1–5 del plan
   (núcleo temporal, capacidad, diagnóstico, colocación, versionado, diff) son paquetes puros
   y **agnósticos al shell HTTP**. Next.js solo afectaría a las fases 6–8. El ahorro es real
   pero se aplica sobre una fracción pequeña del esfuerzo total, mientras que el coste
   dominante del proyecto está en el motor.

2. **La ergonomía de testing del API es materialmente mejor con Fastify, y aquí eso decide.**
   El plan hace que dos reglas innegociables se sostengan sobre tests de API: el aislamiento
   por `user_id` en cada endpoint, y el `409` al aceptar un plan sin diff reconocido.
   `app.inject()` de Fastify da tests HTTP en proceso, sin levantar servidor ni simular
   objetos `Request`/`Response`. **Trabajando en solitario esto pesa más, no menos: el test
   incómodo es el que no se escribe**, y son justamente los tests que protegen las reglas de
   negocio que no pueden fallar.

3. **El modelo de caché de Next.js es un impuesto de aprendizaje y depuración** justo donde
   hay requisitos precisos de `Cache-Control` y `ETag` (feeds `.ics`, que los clientes de
   calendario sondean con agresividad). Es manejable, pero es fricción en el punto exacto
   donde no la quiero.

**Sobre la disponibilidad de horas, que sigue sin confirmarse:** no se asume en ninguna
dirección, y esta decisión es robusta en ambos escenarios. Si la disponibilidad resultara
ser muy baja, **la palanca correcta no sería cambiar de framework —que ahorra días— sino
recortar variantes del alcance, que ahorra semanas** ([ADR-009]). Next.js no es la respuesta
a "tengo poco tiempo" en este proyecto.

**Sigue siendo reversible.** Migrar el shell HTTP no tocaría el motor. Se revisaría si
aparecen requisitos de SEO en páginas públicas, o si el coste de operar dos artefactos
resulta molesto en la práctica.

[ADR-009]: ./ADR-009-alcance-primer-entregable.md

[ADR-004]: ./ADR-004-motor-determinista-vs-llm.md
[ADR-013]: ./ADR-013-motor-como-funcion-pura.md
