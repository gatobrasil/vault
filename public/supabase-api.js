let voziaSupabase = null;

function iniciarSupabase() {
  const cfg = window.VOZIA_SUPABASE_CONFIG;

  if (!cfg || !cfg.url || !cfg.anonKey || cfg.url.includes("COLE_AQUI")) {
    console.warn("Supabase ainda não configurado. Edite public/supabase-config.js");
    return null;
  }

  voziaSupabase = window.supabase.createClient(cfg.url, cfg.anonKey);
  return voziaSupabase;
}

async function voziaGetUser() {
  const sb = voziaSupabase || iniciarSupabase();
  if (!sb) return null;

  const { data, error } = await sb.auth.getUser();

  if (error) {
    console.error(error);
    return null;
  }

  return data.user || null;
}

async function voziaSignUp({ name, email, password, plan, acceptedTerms }) {
  const sb = voziaSupabase || iniciarSupabase();
  if (!sb) throw new Error("Supabase não configurado.");

  if (!acceptedTerms) {
    throw new Error("É necessário aceitar os termos antes do cadastro.");
  }

  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: {
      data: {
        name,
        plan
      }
    }
  });

  if (error) throw error;

  const user = data.user;

  if (!user) {
    return {
      user: null,
      message: "Cadastro iniciado. Verifique o e-mail se a confirmação estiver ativada."
    };
  }

  const { error: profileError } = await sb.from("profiles").insert({
    id: user.id,
    name,
    email,
    plan: plan || "avaliacao",
    accepted_terms_at: new Date().toISOString()
  });

  if (profileError) throw profileError;

  return { user };
}

async function voziaSignIn({ email, password }) {
  const sb = voziaSupabase || iniciarSupabase();
  if (!sb) throw new Error("Supabase não configurado.");

  const { data, error } = await sb.auth.signInWithPassword({
    email,
    password
  });

  if (error) throw error;

  return data.user;
}

async function voziaSignOut() {
  const sb = voziaSupabase || iniciarSupabase();
  if (!sb) return;
  await sb.auth.signOut();
}

async function voziaLoadProfile() {
  const sb = voziaSupabase || iniciarSupabase();
  if (!sb) throw new Error("Supabase não configurado.");

  const user = await voziaGetUser();
  if (!user) return null;

  const { data, error } = await sb
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error) throw error;

  return data;
}

async function voziaListRecordings() {
  const sb = voziaSupabase || iniciarSupabase();
  if (!sb) throw new Error("Supabase não configurado.");

  const { data, error } = await sb
    .from("recordings")
    .select("*")
    .order("phrase_index", { ascending: true });

  if (error) throw error;

  return data || [];
}

async function voziaUploadVoiceRecording({ phraseIndex, phraseCategory, phraseText, audioBlob, durationMs, mimeType, extension }) {
  const sb = voziaSupabase || iniciarSupabase();
  if (!sb) throw new Error("Supabase não configurado.");

  const user = await voziaGetUser();
  if (!user) throw new Error("Usuário não autenticado.");

  const finalMime = mimeType || audioBlob?.type || "audio/mp4";
  const safeExt = extension || (
    finalMime.includes("mp4") ? "mp4" :
    finalMime.includes("mpeg") ? "mp3" :
    finalMime.includes("ogg") ? "ogg" :
    finalMime.includes("wav") ? "wav" :
    "webm"
  );

  const fileName = `frase-${String(phraseIndex + 1).padStart(3, "0")}-${Date.now()}.${safeExt}`;
  const path = `${user.id}/${fileName}`;

  const upload = await voziaUploadWithBucketFallback("voice", path, audioBlob, {
    contentType: finalMime,
    upsert: false
  });

  const { error: dbError } = await sb.from("recordings").upsert({
    user_id: user.id,
    phrase_index: phraseIndex,
    phrase_category: phraseCategory || "",
    phrase_text: phraseText,
    audio_path: path,
    duration_ms: durationMs || null,
    quality_note: qualidadeAudio(durationMs)
  }, {
    onConflict: "user_id,phrase_index"
  });

  if (dbError) throw dbError;

  return { path, bucket: upload.bucket };
}

async function voziaListLegacyMessages() {
  const sb = voziaSupabase || iniciarSupabase();
  if (!sb) throw new Error("Supabase não configurado.");

  const { data, error } = await sb
    .from("legacy_messages")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return data || [];
}

async function voziaSaveLegacyMessage({ title, recipient, note, isPriority, audioBlob, durationMs, mimeType, extension }) {
  const sb = voziaSupabase || iniciarSupabase();
  if (!sb) throw new Error("Supabase não configurado.");

  const user = await voziaGetUser();
  if (!user) throw new Error("Usuário não autenticado.");

  let audioPath = null;

  if (audioBlob) {
    const finalMime = mimeType || audioBlob?.type || "audio/mp4";
    const safeExt = extension || (
      finalMime.includes("mp4") ? "mp4" :
      finalMime.includes("mpeg") ? "mp3" :
      finalMime.includes("ogg") ? "ogg" :
      finalMime.includes("wav") ? "wav" :
      "webm"
    );

    const fileName = `mensagem-${Date.now()}.${safeExt}`;
    audioPath = `${user.id}/${fileName}`;

    await voziaUploadWithBucketFallback("legacy", audioPath, audioBlob, {
      contentType: finalMime,
      upsert: false
    });
  }

  const { error } = await sb.from("legacy_messages").insert({
    user_id: user.id,
    title,
    recipient,
    note,
    audio_path: audioPath,
    duration_ms: durationMs || null,
    is_priority: !!isPriority
  });

  if (error) throw error;

  return true;
}

async function voziaRequestCare({ appModel, keyboardInterest, notes }) {
  const sb = voziaSupabase || iniciarSupabase();
  if (!sb) throw new Error("Supabase não configurado.");

  const user = await voziaGetUser();
  if (!user) throw new Error("Usuário não autenticado.");

  const { error } = await sb.from("vozia_care_requests").insert({
    user_id: user.id,
    app_model: appModel || "botoes_fixos",
    keyboard_interest: keyboardInterest || "nao",
    notes: notes || "",
    status: "solicitado"
  });

  if (error) throw error;

  return true;
}

async function voziaListCareRequests() {
  const sb = voziaSupabase || iniciarSupabase();
  if (!sb) throw new Error("Supabase não configurado.");

  const { data, error } = await sb
    .from("vozia_care_requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return data || [];
}


// ============================================================
// VOZIA — Buckets Supabase com fallback
// Aceita buckets em inglês e em português.
// ============================================================

const VOZIA_BUCKET_CANDIDATES = {
  voice: [
    "voice-recordings",
    "gravações de voz",
    "gravacoes de voz",
    "gravações-de-voz",
    "gravacoes-de-voz"
  ],
  legacy: [
    "legacy-audios",
    "áudios legados",
    "audios legados",
    "áudios-legados",
    "audios-legados"
  ],
  photos: [
    "patient-photos",
    "fotos de pacientes",
    "fotos-de-pacientes"
  ],
  documents: [
    "patient-documents",
    "documentos do paciente",
    "documentos-do-paciente"
  ]
};

async function voziaUploadWithBucketFallback(bucketType, path, fileBlob, options = {}) {
  const sb = voziaSupabase || iniciarSupabase();
  if (!sb) throw new Error("Supabase não configurado.");

  const buckets = VOZIA_BUCKET_CANDIDATES[bucketType] || [bucketType];
  const errors = [];

  for (const bucket of buckets) {
    try {
      const { data, error } = await sb.storage
        .from(bucket)
        .upload(path, fileBlob, options);

      if (!error) {
        return { bucket, data };
      }

      errors.push(`${bucket}: ${error.message || JSON.stringify(error)}`);
    } catch (e) {
      errors.push(`${bucket}: ${e.message || e}`);
    }
  }

  throw new Error(
    "Não consegui enviar o arquivo para o Supabase Storage. " +
    "Verifique se existe o bucket correto. Tentativas: " + errors.join(" | ")
  );
}

async function voziaSignedUrlWithBucketFallback(bucketType, path, expiresIn = 600) {
  const sb = voziaSupabase || iniciarSupabase();
  if (!sb) throw new Error("Supabase não configurado.");

  const buckets = VOZIA_BUCKET_CANDIDATES[bucketType] || [bucketType];
  const errors = [];

  for (const bucket of buckets) {
    try {
      const { data, error } = await sb.storage
        .from(bucket)
        .createSignedUrl(path, expiresIn);

      if (!error && data?.signedUrl) {
        return { bucket, signedUrl: data.signedUrl };
      }

      errors.push(`${bucket}: ${error?.message || "sem URL"}`);
    } catch (e) {
      errors.push(`${bucket}: ${e.message || e}`);
    }
  }

  throw new Error("Não consegui gerar link assinado. " + errors.join(" | "));
}

function qualidadeAudio(ms) {
  if (!ms) return "Duração não informada.";
  if (ms < 900) return "Áudio muito curto. Regravar se a frase não ficou completa.";
  if (ms > 16000) return "Áudio longo. Verificar pausas e ruídos.";
  return "Boa duração.";
}
async function voziaResetPassword(email) {
  const sb = voziaSupabase || iniciarSupabase();
  if (!sb) throw new Error("Supabase não configurado.");

  if (!email) {
    throw new Error("Digite seu e-mail para recuperar a senha.");
  }

  const redirectTo = window.location.origin + "/reset-password.html";

  const { data, error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo
  });

  if (error) throw error;

  return data;
}

async function voziaUpdatePassword(newPassword) {
  const sb = voziaSupabase || iniciarSupabase();
  if (!sb) throw new Error("Supabase não configurado.");

  if (!newPassword || newPassword.length < 6) {
    throw new Error("A nova senha precisa ter pelo menos 6 caracteres.");
  }

  const { data, error } = await sb.auth.updateUser({
    password: newPassword
  });

  if (error) throw error;

  return data;
}

async function voziaGetSignedVoiceUrl(audioPath) {
  const sb = voziaSupabase || iniciarSupabase();
  if (!sb) throw new Error("Supabase não configurado.");

  const { data, error } = await sb.storage
    .from("voice-recordings")
    .createSignedUrl(audioPath, 60 * 10);

  if (error) throw error;
  return data.signedUrl;
}

async function voziaCheckSupabaseUserReady() {
  const sb = voziaSupabase || iniciarSupabase();
  if (!sb) throw new Error("Supabase não configurado.");

  const user = await voziaGetUser();
  if (!user) throw new Error("Usuário não autenticado.");

  const { data: profile, error } = await sb
    .from("profiles")
    .select("id,name,email,plan,vault_id")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;

  if (!profile) {
    throw new Error("Usuário existe no Auth, mas ainda não tem profile. Crie o perfil na tabela profiles.");
  }

  return { user, profile };
}

window.addEventListener("DOMContentLoaded", () => {
  iniciarSupabase();
});