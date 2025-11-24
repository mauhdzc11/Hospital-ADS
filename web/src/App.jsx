import { useEffect, useState } from "react";
import "./App.css";

// Convierte lo que viene del backend a valor para <input type="datetime-local">
function toLocalInputDateTime(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const tzOffset = d.getTimezoneOffset() * 60000; // minutos -> ms
  const local = new Date(d.getTime() - tzOffset);
  return local.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:mm"
}

// Convierte lo que viene del backend a texto "YYYY-MM-DD HH:mm" para mostrar en tablas
function formatDateTimeDisplay(value) {
  const input = toLocalInputDateTime(value);
  if (!input) return "";
  return input.replace("T", " ");
}

// 🔹 NUEVO: separa citas futuras e historial
function separarCitasPorTiempo(citas) {
  const ahora = new Date();
  const futuras = [];
  const historial = [];

  for (const c of citas) {
    if (!c.fecha_hora) {
      historial.push(c);
      continue;
    }

    const fecha = new Date(c.fecha_hora);

    // cita futura = programada y con fecha >= ahora
    if (c.estado_cita === "programada" && fecha >= ahora) {
      futuras.push(c);
    } else {
      historial.push(c);
    }
  }

  return { futuras, historial };
}


function App() {
  const [estado, setEstado] = useState(null);
  const [errorEstado, setErrorEstado] = useState(null);

  const [paciente, setPaciente] = useState(null); // paciente logueado

  const [modoAuth, setModoAuth] = useState("login"); // "login" | "registro"

  const [loginData, setLoginData] = useState({
    correo: "",
    contrasena: "",
  });
  const [loginError, setLoginError] = useState(null);
  const [loginCargando, setLoginCargando] = useState(false);

  const [registroData, setRegistroData] = useState({
    nombre: "",
    apellido_paterno: "",
    apellido_materno: "",
    correo: "",
    contrasena: "",
    telefono: "",
    fecha_nacimiento: "",
    curp: "",
    direccion: "",
    sexo: "", // nuevo campo
  });
  const [registroError, setRegistroError] = useState(null);
  const [registroMensaje, setRegistroMensaje] = useState(null);
  const [registroCargando, setRegistroCargando] = useState(false);

  // Tabs del portal después de login
  const [portalTab, setPortalTab] = useState("citas"); // "citas" | "recetas" | "resultados"

  // Citas
  const [citas, setCitas] = useState([]);
  const [limiteCancelHoras, setLimiteCancelHoras] = useState(24);
  const [citasCargando, setCitasCargando] = useState(false);
  const [citasError, setCitasError] = useState(null);

  const [nuevaCita, setNuevaCita] = useState({
    fecha_hora: "",
    motivo: "",
  });
  const [guardandoCita, setGuardandoCita] = useState(false);
  const [errorNuevaCita, setErrorNuevaCita] = useState("");

  const [reagendandoId, setReagendandoId] = useState(null);
  const [nuevaFechaReagendar, setNuevaFechaReagendar] = useState("");

  // Recetas
  const [recetas, setRecetas] = useState([]);
  const [recetasCargando, setRecetasCargando] = useState(false);
  const [recetasError, setRecetasError] = useState(null);

  // Resultados laboratorio
  const [resultados, setResultados] = useState([]);
  const [resultadosCargando, setResultadosCargando] = useState(false);
  const [resultadosError, setResultadosError] = useState(null);
  const { futuras: citasFuturas, historial: historialCitas } =
    separarCitasPorTiempo(citas);


  // -------- ESTADO DEL BACKEND --------
  useEffect(() => {
    const cargarEstado = async () => {
      try {
        const res = await fetch("http://localhost:3000/api/estado");
        if (!res.ok) throw new Error("Error al consultar el backend");
        const data = await res.json();
        setEstado(data);
      } catch (err) {
        console.error(err);
        setErrorEstado("No se pudo conectar con el servidor.");
      }
    };

    cargarEstado();
  }, []);

  // -------- LOGIN --------

  const handleChangeLogin = (e) => {
    const { name, value } = e.target;
    setLoginData((prev) => ({ ...prev, [name]: value }));
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError(null);
    setLoginCargando(true);

    if (!loginData.correo || !loginData.contrasena) {
      setLoginError("Ingresa tu correo y contraseña.");
      setLoginCargando(false);
      return;
    }

    try {
      const res = await fetch("http://localhost:3000/api/pacientes/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginData),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "No fue posible iniciar sesión.");
      }

      const data = await res.json();
      setPaciente(data);
      setPortalTab("citas");
    } catch (err) {
      console.error(err);
      setLoginError(err.message);
    } finally {
      setLoginCargando(false);
    }
  };

  // -------- REGISTRO --------

  const handleChangeRegistro = (e) => {
    const { name, value } = e.target;
    setRegistroData((prev) => ({ ...prev, [name]: value }));
  };

  const handleRegistro = async (e) => {
    e.preventDefault();
    setRegistroError(null);
    setRegistroMensaje(null);
    setRegistroCargando(true);

    if (
      !registroData.nombre ||
      !registroData.apellido_paterno ||
      !registroData.correo ||
      !registroData.contrasena
    ) {
      setRegistroError(
        "Nombre, apellido paterno, correo y contraseña son obligatorios."
      );
      setRegistroCargando(false);
      return;
    }

    try {
      const res = await fetch("http://localhost:3000/api/pacientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registroData),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "No fue posible crear la cuenta.");
      }

      const data = await res.json();

      setRegistroMensaje("Cuenta creada correctamente. Ya puedes iniciar sesión.");
      setRegistroError(null);

      setLoginData({
        correo: data.correo,
        contrasena: "",
      });

      setModoAuth("login");
    } catch (err) {
      console.error(err);
      setRegistroError(err.message);
    } finally {
      setRegistroCargando(false);
    }
  };

  const handleLogout = () => {
    setPaciente(null);
    setLoginData({ correo: "", contrasena: "" });
    setLoginError(null);
    setPortalTab("citas");

    // limpiar info de portal
    setCitas([]);
    setRecetas([]);
    setResultados([]);
  };

  // -------- CARGA DE DATOS DEL PORTAL (citas, recetas, resultados) --------

  useEffect(() => {
    if (!paciente) return;

    cargarCitas();
    cargarRecetas();
    cargarResultados();
  }, [paciente]);

  const cargarCitas = async () => {
    if (!paciente) return;
    setCitasCargando(true);
    setCitasError(null);

    try {
      const res = await fetch(
        `http://localhost:3000/api/pacientes/${paciente.id_paciente}/citas`
      );
      if (!res.ok) throw new Error("Error al consultar citas");
      const data = await res.json();
      setLimiteCancelHoras(data.limite_cancelacion_horas ?? 24);
      setCitas(data.citas || []);
    } catch (err) {
      console.error(err);
      setCitasError("No se pudieron cargar tus citas.");
    } finally {
      setCitasCargando(false);
    }
  };

  const cargarRecetas = async () => {
    if (!paciente) return;
    setRecetasCargando(true);
    setRecetasError(null);
    try {
      const res = await fetch(
        `http://localhost:3000/api/pacientes/${paciente.id_paciente}/recetas`
      );
      if (!res.ok) throw new Error("Error al consultar recetas");
      const data = await res.json();
      setRecetas(data);
    } catch (err) {
      console.error(err);
      setRecetasError("No se pudieron cargar tus recetas médicas.");
    } finally {
      setRecetasCargando(false);
    }
  };

  const cargarResultados = async () => {
    if (!paciente) return;
    setResultadosCargando(true);
    setResultadosError(null);
    try {
      const res = await fetch(
        `http://localhost:3000/api/pacientes/${paciente.id_paciente}/resultados-laboratorio`
      );
      if (!res.ok) throw new Error("Error al consultar resultados");
      const data = await res.json();
      setResultados(data);
    } catch (err) {
      console.error(err);
      setResultadosError("No se pudieron cargar tus resultados de laboratorio.");
    } finally {
      setResultadosCargando(false);
    }
  };

  // -------- Solicitar nueva cita --------
  // Valida que la fecha/hora de la cita cumpla las reglas del sistema
function validarFechaHoraCita(fechaHoraStr) {
  if (!fechaHoraStr) return "Debes seleccionar fecha y hora.";

  const d = new Date(fechaHoraStr);
  if (Number.isNaN(d.getTime())) {
    return "La fecha y hora no son válidas.";
  }

  // Debe ser en el futuro
  const ahora = new Date();
  if (d <= ahora) {
    return "La cita debe ser en una fecha y hora futura.";
  }

  // Solo lunes a viernes (0 = domingo, 6 = sábado)
  const dia = d.getDay();
  if (dia === 0 || dia === 6) {
    return "Solo se permiten citas de lunes a viernes.";
  }

  const hora = d.getHours();
  const minutos = d.getMinutes();

  // ✅ permitir 08:00 a 16:00 EXACTO
  if (hora < 8 || hora > 16 || (hora === 16 && minutos > 0)) {
    return "Solo se permiten citas de 08:00 a 16:00 hrs.";
  }

  // Solo horas exactas
  if (minutos !== 0) {
    return "Las citas solo pueden agendarse en horas exactas (ej. 8:00, 9:00, 15:00).";
  }

  return null;
}



  const handleNuevaCitaChange = (e) => {
    const { name, value } = e.target;
    setNuevaCita((prev) => ({ ...prev, [name]: value }));
  };

  const handleCrearCita = async (e) => {
  e.preventDefault();
  if (!paciente) return;

  if (!nuevaCita.fecha_hora || !nuevaCita.motivo) {
    alert("Debes capturar fecha/hora y motivo de la cita.");
    return;
  }

  // 🔎 Validación de reglas de horario
  const errorValidacion = validarFechaHoraCita(nuevaCita.fecha_hora);
  if (errorValidacion) {
    alert(errorValidacion);
    return;
  }

  setGuardandoCita(true);
  try {
    const res = await fetch(
      `http://localhost:3000/api/pacientes/${paciente.id_paciente}/citas`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nuevaCita),
      }
    );

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "Error al crear la cita.");
    }

    await res.json(); // por si el backend manda algo
    setNuevaCita({ fecha_hora: "", motivo: "" });
    await cargarCitas();
  } catch (err) {
    console.error(err);
    alert(err.message);
  } finally {
    setGuardandoCita(false);
  }
};


  // -------- Cancelar cita --------

  const handleCancelarCita = async (id_cita) => {
    if (!paciente) return;

    const confirmar = window.confirm("¿Seguro que deseas cancelar esta cita?");
    if (!confirmar) return;

    try {
      const res = await fetch(
        `http://localhost:3000/api/citas/${id_cita}/cancelar`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id_paciente: paciente.id_paciente }),
        }
      );

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(body.error || "No fue posible cancelar la cita.");
      }

      await cargarCitas();
      alert("Cita cancelada correctamente.");
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  };

  // -------- Reagendar cita --------

  const iniciarReagendar = (cita) => {
    setReagendandoId(cita.id_cita);
    setNuevaFechaReagendar(toLocalInputDateTime(cita.fecha_hora));
  };

  const cancelarReagendar = () => {
    setReagendandoId(null);
    setNuevaFechaReagendar("");
  };

  const guardarReagendar = async (id_cita) => {
    if (!paciente) return;

    if (!nuevaFechaReagendar) {
      alert("Debes seleccionar la nueva fecha y hora.");
      return;
    }

    const validacion = validarFechaHoraCita(nuevaFechaReagendar);
    if (!validacion.ok) {
      alert(validacion.mensaje);
      return;
    }

    try {
      const res = await fetch(`http://localhost:3000/api/citas/${id_cita}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_paciente: paciente.id_paciente,
          nueva_fecha_hora: nuevaFechaReagendar,
        }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(body.error || "No fue posible reagendar la cita.");
      }

      cancelarReagendar();
      await cargarCitas();
      alert("Cita reagendada correctamente.");
    } catch (err) {
      console.error(err);
      alert(err.message);
    }
  };
  // -------- RENDER --------

  return (
    <div className="app-root">
      <header className="app-header">
        <div className="header-left">
          <div className="hospital-logo">🏥</div>
          <div>
            <h1>Hospital ADS</h1>
            <p>Portal de Pacientes</p>
          </div>
        </div>
        <div className="header-right">
          {estado && <span className="badge badge-ok">Servidor en línea</span>}
          {errorEstado && (
            <span className="badge badge-error">Sin conexión al servidor</span>
          )}
          {paciente && (
            <button className="btn btn-link" onClick={handleLogout}>
              Cerrar sesión
            </button>
          )}
        </div>
      </header>

      <main className="app-main">
        {!paciente ? (
          // ----------- LOGIN / REGISTRO -----------
          <div className="login-wrapper">
            <section className="panel panel-login">
              <h2 className="panel-title">Acceso al portal</h2>
              <p className="panel-subtitle">
                Inicia sesión o crea una cuenta para consultar tu información
                como paciente.
              </p>

              <div className="tabs-auth">
                <button
                  type="button"
                  className={
                    "tab-auth" +
                    (modoAuth === "login" ? " tab-auth--active" : "")
                  }
                  onClick={() => {
                    setModoAuth("login");
                    setRegistroMensaje(null);
                    setRegistroError(null);
                  }}
                >
                  Iniciar sesión
                </button>
                <button
                  type="button"
                  className={
                    "tab-auth" +
                    (modoAuth === "registro" ? " tab-auth--active" : "")
                  }
                  onClick={() => {
                    setModoAuth("registro");
                    setLoginError(null);
                  }}
                >
                  Crear cuenta
                </button>
              </div>

              {modoAuth === "login" ? (
                <>
                  {loginError && <p className="text-error">{loginError}</p>}

                  <form className="form-login" onSubmit={handleLogin}>
                    <div className="form-field">
                      <label>Correo electrónico</label>
                      <input
                        type="email"
                        name="correo"
                        value={loginData.correo}
                        onChange={handleChangeLogin}
                        placeholder="ejemplo@correo.com"
                      />
                    </div>

                    <div className="form-field">
                      <label>Contraseña</label>
                      <input
                        type="password"
                        name="contrasena"
                        value={loginData.contrasena}
                        onChange={handleChangeLogin}
                      />
                    </div>

                    <div className="form-actions">
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={loginCargando}
                      >
                        {loginCargando ? "Verificando..." : "Ingresar"}
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <>
                  {registroMensaje && (
                    <p className="text-ok">{registroMensaje}</p>
                  )}
                  {registroError && (
                    <p className="text-error">{registroError}</p>
                  )}

                  <form className="form-registro" onSubmit={handleRegistro}>
                    <div className="form-field">
                      <label>Nombre *</label>
                      <input
                        type="text"
                        name="nombre"
                        value={registroData.nombre}
                        onChange={handleChangeRegistro}
                      />
                    </div>

                    <div className="form-field">
                      <label>Apellido paterno *</label>
                      <input
                        type="text"
                        name="apellido_paterno"
                        value={registroData.apellido_paterno}
                        onChange={handleChangeRegistro}
                      />
                    </div>

                    <div className="form-field">
                      <label>Apellido materno</label>
                      <input
                        type="text"
                        name="apellido_materno"
                        value={registroData.apellido_materno}
                        onChange={handleChangeRegistro}
                      />
                    </div>

                    <div className="form-field">
                      <label>Correo electrónico *</label>
                      <input
                        type="email"
                        name="correo"
                        value={registroData.correo}
                        onChange={handleChangeRegistro}
                      />
                    </div>

                    <div className="form-field">
                      <label>Contraseña *</label>
                      <input
                        type="password"
                        name="contrasena"
                        value={registroData.contrasena}
                        onChange={handleChangeRegistro}
                      />
                    </div>

                    <div className="form-field">
                      <label>Teléfono</label>
                      <input
                        type="text"
                        name="telefono"
                        value={registroData.telefono}
                        onChange={handleChangeRegistro}
                      />
                    </div>

                    <div className="form-field">
                      <label>Fecha de nacimiento</label>
                      <input
                        type="date"
                        name="fecha_nacimiento"
                        value={registroData.fecha_nacimiento}
                        onChange={handleChangeRegistro}
                      />
                    </div>

                    <div className="form-field">
                      <label>CURP</label>
                      <input
                        type="text"
                        name="curp"
                        value={registroData.curp}
                        onChange={handleChangeRegistro}
                      />
                    </div>

                    <div className="form-field">
                      <label>Sexo</label>
                      <select
                        name="sexo"
                        value={registroData.sexo}
                        onChange={handleChangeRegistro}
                      >
                        <option value="">Selecciona una opción</option>
                        <option value="F">Femenino</option>
                        <option value="M">Masculino</option>
                        <option value="O">Otro</option>
                      </select>
                    </div>

                    <div className="form-field">
                      <label>Dirección</label>
                      <textarea
                        name="direccion"
                        rows={3}
                        value={registroData.direccion}
                        onChange={handleChangeRegistro}
                      />
                    </div>

                    <div className="form-actions">
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={registroCargando}
                      >
                        {registroCargando ? "Guardando..." : "Crear cuenta"}
                      </button>
                    </div>
                  </form>
                </>
              )}

              <p className="nota-ayuda">
                Si tienes dudas sobre tu acceso, comunícate al área de admisión
                del hospital.
              </p>
            </section>
          </div>
        ) : (
          // ----------- PORTAL DEL PACIENTE -----------
          <>
            <section className="layout-two-columns">
              <section className="panel">
                <h2 className="panel-title">Datos personales</h2>

                <div className="detalle-paciente">
                  <div>
                    <span className="detalle-label">Nombre:</span>
                    <span>
                      {paciente.nombre} {paciente.apellido_paterno}{" "}
                      {paciente.apellido_materno}
                    </span>
                  </div>

                  <div>
                    <span className="detalle-label">Correo:</span>
                    <span>{paciente.correo}</span>
                  </div>

                  <div>
                    <span className="detalle-label">CURP:</span>
                    <span>{paciente.curp || "No registrada"}</span>
                  </div>

                  <div>
                    <span className="detalle-label">Fecha de nacimiento:</span>
                    <span>
                      {paciente.fecha_nacimiento?.slice(0, 10) || "-"}
                    </span>
                  </div>

                  <div>
                    <span className="detalle-label">Teléfono:</span>
                    <span>{paciente.telefono || "No registrado"}</span>
                  </div>

                  <div>
                    <span className="detalle-label">Sexo:</span>
                    <span>{paciente.sexo || "No registrado"}</span>
                  </div>

                  <div>
                    <span className="detalle-label">Dirección:</span>
                    <span>{paciente.direccion || "No registrada"}</span>
                  </div>

                  <div>
                    <span className="detalle-label">Estatus afiliación:</span>
                    <span>{paciente.estatus_afiliacion || "Sin definir"}</span>
                  </div>
                </div>
              </section>

              <section className="panel">
                <h2 className="panel-title">Resumen del portal</h2>
                <p className="texto-suave">
                  Desde este portal puedes gestionar tus citas médicas, consultar
                  tus recetas y revisar los resultados de laboratorio que el
                  hospital haya registrado para ti.
                </p>
                <ul className="lista-resumen">
                  <li>Solicitar, reagendar o cancelar citas (según políticas).</li>
                  <li>Revisar tu historial de citas.</li>
                  <li>Consultar recetas médicas registradas.</li>
                  <li>Ver resultados de estudios de laboratorio.</li>
                </ul>
              </section>
            </section>

            {/* Tabs del portal: Citas / Recetas / Resultados */}
            <section className="panel" style={{ marginTop: "1rem", width: "100%" }}>
              <div className="tabs-auth">
                <button
                  type="button"
                  className={
                    "tab-auth" +
                    (portalTab === "citas" ? " tab-auth--active" : "")
                  }
                  onClick={() => setPortalTab("citas")}
                >
                  Mis citas
                </button>
                <button
                  type="button"
                  className={
                    "tab-auth" +
                    (portalTab === "recetas" ? " tab-auth--active" : "")
                  }
                  onClick={() => setPortalTab("recetas")}
                >
                  Recetas médicas
                </button>
                <button
                  type="button"
                  className={
                    "tab-auth" +
                    (portalTab === "resultados" ? " tab-auth--active" : "")
                  }
                  onClick={() => setPortalTab("resultados")}
                >
                  Resultados de laboratorio
                </button>
              </div>

                            {portalTab === "citas" && (
                <>
                  <p className="texto-suave">
                    Puedes ver tus próximas citas y el historial. Las
                    cancelaciones solo se permiten con al menos{" "}
                    <strong>{limiteCancelHoras}</strong> horas de anticipación.
                  </p>

                  {citasCargando && <p>Cargando citas...</p>}
                  {citasError && <p className="text-error">{citasError}</p>}

                  {!citasCargando &&
                    !citasError &&
                    citasFuturas.length === 0 &&
                    historialCitas.length === 0 && (
                      <p>No tienes citas registradas.</p>
                    )}

                  {/* Próximas citas */}
                  {!citasCargando &&
                    !citasError &&
                    citasFuturas.length > 0 && (
                      <>
                        <h4>Próximas citas</h4>
                        <div className="table-wrapper">
                          <table className="table">
                            <thead>
                              <tr>
                                <th>Fecha y hora</th>
                                <th>Motivo</th>
                                <th>Estado</th>
                                <th>Acciones</th>
                              </tr>
                            </thead>
                            <tbody>
                              {citasFuturas.map((c) => (
                                <tr key={c.id_cita}>
                                  <td>{formatDateTimeDisplay(c.fecha_hora)}</td>
                                  <td>{c.motivo}</td>
                                  <td>{c.estado_cita}</td>
                                  <td>
                                    {c.estado_cita === "programada" && (
                                      <>
                                        {reagendandoId === c.id_cita ? (
                                          <div
                                            style={{
                                              display: "flex",
                                              gap: "0.25rem",
                                            }}
                                          >
                                            <input
                                              type="datetime-local"
                                              value={nuevaFechaReagendar}
                                              onChange={(e) =>
                                                setNuevaFechaReagendar(
                                                  e.target.value
                                                )
                                              }
                                              step="3600"
                                            />
                                            <button
                                              type="button"
                                              className="btn btn-primary"
                                              onClick={() =>
                                                guardarReagendar(c.id_cita)
                                              }
                                            >
                                              Guardar
                                            </button>
                                            <button
                                              type="button"
                                              className="btn btn-link"
                                              onClick={cancelarReagendar}
                                            >
                                              Cancelar
                                            </button>
                                          </div>
                                        ) : (
                                          <div
                                            style={{
                                              display: "flex",
                                              gap: "0.25rem",
                                            }}
                                          >
                                            <button
                                              type="button"
                                              className="btn btn-link"
                                              onClick={() => iniciarReagendar(c)}
                                            >
                                              Reagendar
                                            </button>
                                            {c.puede_cancelar ? (
                                              <button
                                                type="button"
                                                className="btn btn-link"
                                                onClick={() =>
                                                  handleCancelarCita(c.id_cita)
                                                }
                                              >
                                                Cancelar
                                              </button>
                                            ) : (
                                              <span
                                                style={{
                                                  fontSize: "0.75rem",
                                                  color: "#9ca3af",
                                                }}
                                              >
                                                No se puede cancelar
                                              </span>
                                            )}
                                          </div>
                                        )}
                                      </>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}

                  {/* Historial de citas */}
                  {!citasCargando &&
                    !citasError &&
                    historialCitas.length > 0 && (
                      <>
                        <h4 style={{ marginTop: "1rem" }}>Historial de citas</h4>
                        <div className="table-wrapper">
                          <table className="table">
                            <thead>
                              <tr>
                                <th>Fecha y hora</th>
                                <th>Motivo</th>
                                <th>Estado</th>
                                <th>Acciones</th>
                              </tr>
                            </thead>
                            <tbody>
                              {historialCitas.map((c) => (
                                <tr key={c.id_cita}>
                                  <td>{formatDateTimeDisplay(c.fecha_hora)}</td>
                                  <td>{c.motivo}</td>
                                  <td>{c.estado_cita}</td>
                                  <td>
                                    {/* En historial ya no se puede reagendar ni cancelar */}
                                    <span
                                      style={{
                                        fontSize: "0.75rem",
                                        color: "#9ca3af",
                                      }}
                                    >
                                      - sin acciones -
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}

                  <hr style={{ margin: "1rem 0" }} />

                  <h3 className="panel-title">Solicitar nueva cita</h3>
                  <form
                    className="form-login"
                    onSubmit={handleCrearCita}
                    style={{ maxWidth: "480px" }}
                  >
                    <div className="form-field">
                      <label>Fecha y hora</label>
                      <input
                        type="datetime-local"
                        name="fecha_hora"
                        value={nuevaCita.fecha_hora}
                        onChange={handleNuevaCitaChange}
                        step="3600"
                      />
                    </div>
                    <small
                      style={{
                        fontSize: "0.8rem",
                        color: "#4b5563",
                        display: "block",
                        marginBottom: "0.5rem",
                      }}
                    >
                      Solo se permiten citas de lunes a viernes, de 08:00 a 16:00
                      hrs, en horas exactas.
                    </small>
                    {errorNuevaCita && (
                      <p className="text-error">{errorNuevaCita}</p>
                    )}

                    <div className="form-field">
                      <label>Motivo de la consulta</label>
                      <input
                        type="text"
                        name="motivo"
                        value={nuevaCita.motivo}
                        onChange={handleNuevaCitaChange}
                      />
                    </div>
                    <div className="form-actions">
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={guardandoCita}
                      >
                        {guardandoCita ? "Guardando..." : "Solicitar cita"}
                      </button>
                    </div>
                  </form>
                </>
              )}


              {portalTab === "recetas" && (
                <>
                  {recetasCargando && <p>Cargando recetas...</p>}
                  {recetasError && (
                    <p className="text-error">{recetasError}</p>
                  )}
                  {!recetasCargando && !recetasError && recetas.length === 0 && (
                    <p>No hay recetas médicas registradas.</p>
                  )}
                  {!recetasCargando && recetas.length > 0 && (
                    <div className="table-wrapper">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Fecha</th>
                            <th>Descripción</th>
                            <th>Medicamentos</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recetas.map((r) => (
                            <tr key={r.id_receta}>
                              <td>{formatDateTimeDisplay(r.fecha_receta)}</td>
                              <td>{r.descripcion}</td>
                              <td>{r.medicamentos}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}

              {portalTab === "resultados" && (
                <>
                  {resultadosCargando && <p>Cargando resultados...</p>}
                  {resultadosError && (
                    <p className="text-error">{resultadosError}</p>
                  )}
                  {!resultadosCargando &&
                    !resultadosError &&
                    resultados.length === 0 && (
                      <p>No hay resultados de laboratorio registrados.</p>
                    )}
                  {!resultadosCargando && resultados.length > 0 && (
                    <div className="table-wrapper">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Fecha</th>
                            <th>Estudio</th>
                            <th>Resultado</th>
                            <th>Unidad</th>
                            <th>Valores de referencia</th>
                          </tr>
                        </thead>
                        <tbody>
                          {resultados.map((r) => (
                            <tr key={r.id_resultado}>
                              <td>{formatDateTimeDisplay(r.fecha_resultado)}</td>
                              <td>{r.nombre_estudio}</td>
                              <td>{r.resultado}</td>
                              <td>{r.unidad}</td>
                              <td>{r.valores_referencia}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default App;
