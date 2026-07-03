# Add project specific ProGuard rules here.
# P11: minification + resource shrinking are on for :app:assembleRelease.

# ---------------------------------------------------------------------------
# kotlinx.serialization — the official Android/R8 rule block (from the
# kotlinx.serialization README's "Android" section). Without this, R8 renames
# or strips the generated `$$serializer` classes and companion `serializer()`
# factories our @Serializable wire DTOs (ai.gowtam.oak.wire.*) rely on, which
# fails SILENTLY at runtime as a decode exception on the very first response —
# exactly the "classic silent-breaker" this pass is guarding against.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-dontwarn kotlinx.serialization.internal.ClassValueReferences

-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}

-keep,includedescriptorclasses class ai.gowtam.oak.**$$serializer { *; }
-keepclassmembers class ai.gowtam.oak.** {
    *** Companion;
}
-keepclasseswithmembers class ai.gowtam.oak.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Generic signatures matter for kotlinx.serialization's generic serializers
# (e.g. List<TeamMember>, Map<String, JsonScalar>).
-keepattributes Signature,RuntimeVisibleAnnotations,AnnotationDefault

# Enum serialization reads .entries/.values() reflectively in some paths.
-keepclassmembers enum ai.gowtam.oak.** {
    <fields>;
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# ---------------------------------------------------------------------------
# OkHttp / Okio — Square's standard consumer rules (the AAR ships its own
# consumer-proguard rules for the OkHttp/Okio types themselves; these cover
# the optional runtime-detected platforms OkHttp probes for on Android, which
# aren't present here and would otherwise emit R8 warnings/errors).
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**
-dontwarn org.codehaus.mojo.animal_sniffer.*
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

# ---------------------------------------------------------------------------
# androidx.security.crypto (Tink, backing TokenStore's Keystore-encrypted
# prefs) references Error Prone's compile-time-only annotations, which are
# absent at runtime by design — R8's default "missing classes" check treats
# that absence as an error rather than a warning. Google's own R8-generated
# missing_rules.txt for this exact dependency prescribes these -dontwarns.
-dontwarn com.google.errorprone.annotations.CanIgnoreReturnValue
-dontwarn com.google.errorprone.annotations.CheckReturnValue
-dontwarn com.google.errorprone.annotations.Immutable
-dontwarn com.google.errorprone.annotations.RestrictedApi
