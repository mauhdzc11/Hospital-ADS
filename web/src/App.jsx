import { useEffect, useState } from "react";
import "./App.css";

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
  });
  const [registroError, setRegistroError] = useState(null);
  const [registroMensaje, setRegistroMensaje] = useState(null);
  const [registroCargando, setRegistroCargando] = useState(false);

  // Cargar estado del backend
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

  // ------- LOGIN -------

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
    } catch (err) {
      console.error(err);
      setLoginError(err.message);
    } finally {
      setLoginCargando(false);
    }
  };

  // ------- REGISTRO -------

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
  };

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
                  <span>{paciente.fecha_nacimiento?.slice(0, 10) || "-"}</span>
                </div>

                <div>
                  <span className="detalle-label">Teléfono:</span>
                  <span>{paciente.telefono || "No registrado"}</span>
                </div>

                <div>
                  <span className="detalle-label">Dirección:</span>
                  <span>{paciente.direccion || "No registrada"}</span>
                </div>
              </div>
            </section>

            <section className="panel">
              <h2 className="panel-title">Resumen de expediente</h2>
              <p className="texto-suave">
                En esta sección, en versiones posteriores del sistema, podrás
                consultar tus citas, notas médicas y resultados de laboratorio
                que el hospital ponga a tu disposición.
              </p>
              <ul className="lista-resumen">
                <li>Datos generales de tu perfil.</li>
                <li>Consultas y citas recientes (pendiente).</li>
                <li>Resultados de estudios (pendiente).</li>
              </ul>
            </section>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
