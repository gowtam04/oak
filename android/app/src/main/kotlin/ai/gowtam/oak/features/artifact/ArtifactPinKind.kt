package ai.gowtam.oak.features.artifact

/** Pin kinds accepted by `/api/conversations/:id/artifact-pins` (PIN-BR-2). */
enum class ArtifactPinKind(val rawValue: String) {
    TeamSheet("team_sheet"),
    Comparison("comparison"),
    Calc("calc"),
}
