# Documentación MaxiDocs

Análisis completo del proyecto y plan de evolución hacia un generador de
documentos tipo PandaDoc.

| Doc | Contenido |
|---|---|
| [00 — Qué hace hoy](00-QUE-HACE-HOY.md) | Inventario funcional completo: endpoints, servicios, frontend, y qué está muerto |
| [01 — Bugs y riesgos](01-BUGS-Y-RIESGOS.md) | 33 hallazgos con archivo:línea, ordenados por severidad |
| [02 — Arquitectura](02-ARQUITECTURA.md) | Qué está bien, qué está mal, y la arquitectura objetivo |
| [03 — Cómo funciona PandaDoc](03-COMO-FUNCIONA-PANDADOC.md) | Su modelo de datos, comparación capacidad por capacidad, qué copiar y qué no |
| [04 — Roadmap v3](04-ROADMAP-V3.md) | Plan por fases con esfuerzos estimados |
| [05 — Entorno lab](05-ENTORNO-LAB.md) | Cómo trabajar sin tocar producción (✅ funcionando) |
| [06 — Cotizaciones múltiples y versiones](06-COTIZACIONES-MULTIPLES-Y-VERSIONES.md) | Varias cotizaciones por cliente, e historial de quién hizo qué |
| [07 — ¿Se borra lo que ya tenemos?](07-SE-BORRA-LO-QUE-YA-TENEMOS.md) | No. Cómo se despliega la v3 sin perder un solo documento |
| [08 — Autenticación](08-AUTENTICACION.md) | El hallazgo #1 resuelto, y qué configurar antes de desplegar |
| [**PROGRESO**](PROGRESO.md) | **Qué está arreglado y qué sigue** |

---

## Los cuatro titulares

1. ~~**La autenticación es falsificable con un `curl`.**~~ ✅ **Resuelto.** Ahora se
   verifica el `sessionToken` que Monday firma. Los headers falsificados dan 401.
   → [08 — Autenticación](08-AUTENTICACION.md)

2. **El documento es un blob de HTML.** De ahí salen las cinco funciones que
   parsean HTML con regex, los dos modos del editor, y la imposibilidad de hacer
   documentos editables o export a DOCX. → [02](02-ARQUITECTURA.md)

3. **Hay dos fórmulas distintas para el total de una cotización.** Lo que se manda
   a Monday puede no coincidir con lo que dice el PDF. → [01 #19](01-BUGS-Y-RIESGOS.md)

4. **MaxiDocs ya tiene ~40% de PandaDoc construido**, buena parte desconectado de
   la UI. Falta menos código del que parece; falta el modelo de datos correcto.
   → [03 §2](03-COMO-FUNCIONA-PANDADOC.md)
