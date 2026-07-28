# ADR-011: Sin campos de salud; toda limitación se expresa como tiempo y energía
Estado: aceptado (2026-07-28)
Fecha: 2026-07-24
**Puerta de una sola dirección.** Una vez almacenados, estos datos ya existieron.

## Contexto

El brief es explícito: el sistema debe respetar las restricciones prácticas derivadas de
condiciones personales de salud **"sin solicitar, registrar ni inferir información médica"**.
Y en las consideraciones transversales: "el diseño debe minimizar lo que se almacena, evitar
por completo datos de salud".

Esto choca de frente con la realidad del dominio. El sistema necesita saber que:

- Los martes de 10 a 13 la persona no está disponible, y que ese compromiso no es negociable.
- Los miércoles no puede sostener trabajo profundo.
- Necesita 30 minutos de recuperación después de cierta actividad.

Todo eso es exactamente lo que rodea a un tratamiento médico. **La información útil para
planificar y la información médica están separadas por una línea muy fina**, y si no se
diseña esa línea de forma deliberada, el sistema acaba siendo un registro clínico por
acumulación.

Además hay tres puntos por donde la información entra sin que nadie lo decida:

1. Campos de texto libre (títulos, etiquetas, notas).
2. Un campo de "motivo" en cualquier limitación de capacidad.
3. Cualquier captura en lenguaje natural: alguien escribirá *"los martes tengo diálisis"*.

## Decisión

**La única moneda del sistema es el tiempo y la energía. Nada más se registra.**

**1. Campos que no existen y no se van a añadir.**
No hay `condicion`, `diagnostico`, `sintoma`, `medicacion`, `estado_animo`, `nivel_dolor`,
`categoria_de_ausencia`, ni ningún campo de **motivo** asociado a una limitación de capacidad.
`capacity_modifiers` lleva un comentario en el DDL declarando esa ausencia como intencional,
y hay un **test que verifica por introspección del esquema que la tabla no tiene columnas de
texto libre**.

**2. Las limitaciones se expresan solo en términos operativos.**
- Indisponibilidad → `FixedCommitment` con horario, transiciones y `negotiable = false`.
  El título lo escribe el usuario; el sistema **no lo interpreta, no lo clasifica y no lo
  indexa**.
- Menor capacidad de foco → `CapacityModifier { intervalo, focusCapacity }`. Sin motivo.
- Recuperación necesaria → `Transition { kind: RECOVERY, minutes }`.

**3. Normalizador de entrada obligatorio.**
Todo texto libre que pueda contener una restricción pasa por un componente que produce
**únicamente** la restricción temporal. De *"los martes tengo quimioterapia de 10 a 13"* el
único resultado persistible es
`{ FIXED_COMMITMENT, martes 10:00–13:00, negotiable: false }`. La etiqueta clínica se descarta
antes de tocar el almacenamiento y **no se devuelve al cliente** en el campo `discarded`.
Este componente existe aunque la entrevista conversacional esté diferida, porque cualquier
campo de texto libre lo necesita.

**4. Prohibición de inferencia.**
No se deriva ninguna categoría ni etiqueta a partir de patrones. Un compromiso semanal no
negociable de tres horas con recuperación posterior es, para el sistema, un compromiso semanal
no negociable de tres horas. **No se clasifica, no se agrupa por tipo, no se usa para
segmentar.** Esto excluye por diseño cualquier analítica que categorice compromisos.

**5. El texto libre no se indexa, no se registra en logs y no sale del sistema.**
Logging estructurado con redacción por defecto: se registran identificadores y magnitudes,
nunca contenidos. Ningún texto libre se envía a un proveedor externo (incluido un LLM) sin
consentimiento explícito por operación.

**6. Portabilidad y borrado como funcionalidad.**
`GET /me/export` y `DELETE /me` en el primer entregable, con revocación de feeds en la misma
transacción.

**7. Ningún título de una entidad se copia en un campo de texto de otra.**
Añadido el 2026-07-27 al resolverse Q8. Las narrativas de sacrificio y los titulares de diff
se persisten como plantilla + parámetros con referencias por id, no como texto redactado. Un
título copiado sobreviviría al borrado de su entidad y haría inejecutable el derecho de
supresión a granularidad fina. Ver [ADR-014].

## Alternativas consideradas

**Campo de motivo opcional, con aviso al usuario.**
A favor: mejora la experiencia (el usuario recuerda por qué bloqueó ese martes) y sería
información voluntaria. En contra: **es exactamente lo que el brief prohíbe**, y un campo
opcional con aviso sigue siendo un registro de datos de salud en cuanto alguien lo rellena.
Además convierte la base de datos en un objetivo de categoría distinta y traslada al usuario
una decisión que no debería tener que tomar. Se descarta.

**Cifrado a nivel de campo para datos sensibles.**
A favor: reduce el impacto de un compromiso de la base de datos. En contra: no resuelve el
problema real, que es **que el dato no debería existir**. Cifrar información médica sigue
siendo registrarla, con las obligaciones legales correspondientes. Además el cifrado
por campo impide consultar e introduce gestión de claves. Se descarta por atacar el síntoma:
la ausencia del campo es una defensa más fuerte que cualquier cifrado.

**Categorías genéricas y neutras ("cita profesional", "asunto personal", "cuidado propio").**
A favor: parece un punto medio inofensivo y ayudaría a la interfaz. En contra: una categoría
como "cuidado propio" que aparece cada martes con recuperación posterior **es información
médica inferible**, y el brief prohíbe también inferir. La categorización es precisamente el
mecanismo por el que un dato inocuo se vuelve sensible al agregarse. Se descarta.

**Permitir que un LLM interprete y estructure el texto libre completo.**
En contra: sería enviar información médica a un tercero. El normalizador está diseñado para
que la salida sea una estructura temporal cerrada, y **cualquier LLM que participe recibe
únicamente el fragmento necesario y devuelve un tipo cerrado**, nunca texto libre que se
persista.

## Consecuencias

**Lo que ganamos**
- El sistema **no puede filtrar información médica porque no la tiene**. Es la única garantía
  que no depende de que el código sea correcto.
- Queda fuera del alcance de las normativas más estrictas sobre datos de salud, lo que
  simplifica el cumplimiento y el hosting.
- La superficie de daño ante un compromiso de la base de datos es mucho menor.
- El modelo es más simple: menos campos, menos casuística, menos decisiones de interfaz.

**Lo que cuesta**
- **Peor experiencia en un caso real.** Alguien con una condición crónica tendrá que
  reintroducir sus limitaciones sin que el sistema "entienda" el patrón ni se lo recuerde. Es
  un coste consciente y es lo que el brief pide.
- **El sistema no puede anticipar patrones cíclicos de energía** que un producto con datos
  clínicos sí podría. Se renuncia a esa capacidad por completo.
- Se pierde una fuente de personalización potencialmente valiosa.
- El normalizador es trabajo extra en el borde de entrada, incluso con la entrevista
  conversacional diferida.

**Lo que queda condicionado**
- El esquema de [02](../02-modelo-de-datos.md), y en particular la forma de
  `capacity_modifiers`.
- **[ADR-014] (RGPD) se apoya en este ADR:** al no almacenar datos de salud, el sistema queda
  fuera de las categorías especiales del art. 9, que es el régimen que habría obligado a
  cifrado por campo, seudonimización y evaluación de impacto. Esta decisión, tomada por
  fidelidad al brief, resulta ser también la que abarata todo el cumplimiento.
- El contrato: `POST /capacity-modifiers` **rechaza con 422** cualquier campo `reason`, `note`
  o `category`. La prohibición se hace cumplir en el borde, no por convención.
- El guardrail nº3 de [07](../07-convenciones-propuestas.md), pensado para que la prohibición
  sobreviva a futuras sesiones y a la presión de las fechas.
- El pipeline del LLM del [ADR-004], si llega a existir.

[ADR-004]: ./ADR-004-motor-determinista-vs-llm.md
[ADR-014]: ./ADR-014-cumplimiento-rgpd.md
