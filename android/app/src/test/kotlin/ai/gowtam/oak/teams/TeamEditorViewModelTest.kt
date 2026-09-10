package ai.gowtam.oak.teams

import ai.gowtam.oak.features.teams.TeamEditorViewModel
import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.support.FakeDexLookupService
import ai.gowtam.oak.support.FakeTeamService
import ai.gowtam.oak.support.MainDispatcherRule
import ai.gowtam.oak.support.fakeTeam
import ai.gowtam.oak.support.FakeTeamService.AnalyzeStep
import ai.gowtam.oak.wire.BaseStats
import ai.gowtam.oak.wire.DefenseRow
import ai.gowtam.oak.wire.DexSpriteRef
import ai.gowtam.oak.wire.EntityKind
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.LearnsetMove
import ai.gowtam.oak.wire.Offense
import ai.gowtam.oak.wire.SearchMatch
import ai.gowtam.oak.wire.StatSpread
import ai.gowtam.oak.wire.TeamAnalysis
import ai.gowtam.oak.wire.TeamAnalysisOk
import ai.gowtam.oak.wire.TeamMember
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * Exercises [TeamEditorViewModel] against [FakeTeamService]/[FakeDexLookupService]
 * (implementation-plan.md P10 acceptance checks 1–3; mirrors iOS
 * `TeamEditorViewModelTests`): draft mutations, learnset-scoped move options,
 * ability options scoped to the resolved sprite ref, the Mega required-item
 * auto-force (forward-only / idempotent / never-clears), warn-but-allow save, and
 * export.
 */
@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
class TeamEditorViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private fun advanceUntilIdle() = mainDispatcherRule.dispatcher.scheduler.advanceUntilIdle()

    private fun spriteRef(
        name: String,
        types: List<String> = listOf("normal"),
        requiredItem: String? = null,
        abilities: List<String> = emptyList(),
    ) = DexSpriteRef(
        displayName = name,
        spriteUrl = "https://example.test/$name.png",
        dexNumber = 1,
        types = types,
        requiredItem = requiredItem,
        abilities = abilities,
        baseStats = BaseStats(hp = 80, atk = 80, def = 80, spa = 80, spd = 80, spe = 80),
    )

    private fun member(species: String, item: String? = null) = TeamMember(
        species = species, ability = null, item = item, moves = emptyList(), nature = null,
        evs = StatSpread(0, 0, 0, 0, 0, 0), ivs = StatSpread(31, 31, 31, 31, 31, 31),
        teraType = null, level = 50,
    )

    // -------------------------------------------------------------------
    // Draft mutations
    // -------------------------------------------------------------------

    @Test
    fun aFreshEditorSeedsOneEmptyMemberSlot() = runTest(mainDispatcherRule.dispatcher) {
        val model = TeamEditorViewModel(FakeTeamService(), format = Format.Champions)

        assertEquals(1, model.uiState.value.members.size)
        assertNull(model.uiState.value.teamId)
        assertEquals(Format.Champions, model.format)
    }

    @Test
    fun updateMemberAppliesTheTransformInPlace() = runTest(mainDispatcherRule.dispatcher) {
        val model = TeamEditorViewModel(FakeTeamService(), format = Format.Champions)

        model.updateMember(0) { it.copy(species = "garchomp") }
        advanceUntilIdle()

        assertEquals("garchomp", model.uiState.value.members[0].species)
    }

    @Test
    fun addMemberIsCappedAtSixSlots() = runTest(mainDispatcherRule.dispatcher) {
        val model = TeamEditorViewModel(FakeTeamService(), format = Format.Champions)
        repeat(10) { model.addMember() }

        assertEquals(6, model.uiState.value.members.size)
        assertFalse(model.canAddMember)
    }

    @Test
    fun removeMemberDropsTheSlotAtIndex() = runTest(mainDispatcherRule.dispatcher) {
        val model = TeamEditorViewModel(FakeTeamService(), format = Format.Champions)
        model.addMember()
        model.updateMember(1) { it.copy(species = "keep-me") }
        advanceUntilIdle()

        model.removeMember(0)

        assertEquals(1, model.uiState.value.members.size)
        assertEquals("keep-me", model.uiState.value.members[0].species)
    }

    @Test
    fun moveMemberInsertsAtDestinationAndPreservesIdentity() = runTest(mainDispatcherRule.dispatcher) {
        val model = TeamEditorViewModel(FakeTeamService(), format = Format.Champions)
        repeat(3) { model.addMember() }
        model.updateMember(0) { it.copy(species = "a") }
        model.updateMember(1) { it.copy(species = "b") }
        model.updateMember(2) { it.copy(species = "c") }
        model.updateMember(3) { it.copy(species = "d") }
        val idA = model.uiState.value.members[0].id

        model.moveMember(0, 3)

        assertEquals(listOf("b", "c", "d", "a"), model.uiState.value.members.map { it.species })
        assertEquals(idA, model.uiState.value.members[3].id)
    }

    @Test
    fun moveMemberShiftsForwardTowardTheFront() = runTest(mainDispatcherRule.dispatcher) {
        val model = TeamEditorViewModel(FakeTeamService(), format = Format.Champions)
        repeat(3) { model.addMember() }
        model.updateMember(0) { it.copy(species = "a") }
        model.updateMember(1) { it.copy(species = "b") }
        model.updateMember(2) { it.copy(species = "c") }
        model.updateMember(3) { it.copy(species = "d") }
        val idD = model.uiState.value.members[3].id

        model.moveMember(3, 0)

        assertEquals(listOf("d", "a", "b", "c"), model.uiState.value.members.map { it.species })
        assertEquals(idD, model.uiState.value.members[0].id)
    }

    @Test
    fun moveMemberNoopsWhenReadOnlyOrOutOfBounds() = runTest(mainDispatcherRule.dispatcher) {
        val archived = TeamEditorViewModel(
            FakeTeamService(),
            team = fakeTeam(id = "t1").copy(
                format = Format.ScarletViolet,
                members = listOf(member("a"), member("b")),
            ),
        )
        assertTrue(archived.isReadOnly)
        archived.moveMember(0, 1)
        assertEquals(listOf("a", "b"), archived.uiState.value.members.map { it.species })

        val living = TeamEditorViewModel(FakeTeamService(), format = Format.Champions)
        living.updateMember(0) { it.copy(species = "only") }
        living.moveMember(0, 5)
        living.moveMember(0, 0)
        assertEquals(listOf("only"), living.uiState.value.members.map { it.species })
    }

    // -------------------------------------------------------------------
    // Dex lookups: search / ability options / learnset-scoped moves
    // -------------------------------------------------------------------

    @Test
    fun searchEntitiesDelegatesToDexLookupScopedToTheFixedFormat() = runTest(mainDispatcherRule.dispatcher) {
        val dex = FakeDexLookupService(searchResult = listOf(SearchMatch(slug = "garchomp", displayName = "Garchomp", kind = EntityKind.POKEMON)))
        val model = TeamEditorViewModel(FakeTeamService(), dex, format = Format.Gen5)

        val results = model.searchEntities(EntityKind.POKEMON, "garch")

        assertEquals(1, results.size)
        assertEquals("garchomp", results.first().slug)
        assertEquals(Triple(EntityKind.POKEMON, "garch", Format.Champions), dex.searchCalls.single())
    }

    @Test
    fun abilityOptionsComeOnlyFromTheResolvedSpriteRefsLegalAbilities() = runTest(mainDispatcherRule.dispatcher) {
        val dex = FakeDexLookupService(spritesResult = mapOf("garchomp" to spriteRef("Garchomp", abilities = listOf("sand-veil", "rough-skin"))))
        val model = TeamEditorViewModel(FakeTeamService(), dex, format = Format.Champions)
        model.updateMember(0) { it.copy(species = "garchomp") }
        advanceUntilIdle()

        val options = model.abilityOptions("garchomp")

        assertEquals(setOf("sand-veil", "rough-skin"), options.map { it.slug }.toSet())
    }

    @Test
    fun abilityOptionsAreEmptyForAnUnresolvedSpecies() = runTest(mainDispatcherRule.dispatcher) {
        val model = TeamEditorViewModel(FakeTeamService(), format = Format.Champions)
        assertTrue(model.abilityOptions("unknown-mon").isEmpty())
    }

    @Test
    fun movepoolOptionsOfferOnlyTheSpeciesFetchedLearnsetSortedByName() = runTest(mainDispatcherRule.dispatcher) {
        val dex = FakeDexLookupService(
            learnsetResult = listOf(
                LearnsetMove(slug = "earthquake", displayName = "Earthquake", type = "ground", damageClass = LearnsetMove.DamageClass.PHYSICAL, power = 100),
                LearnsetMove(slug = "dragon-claw", displayName = "Dragon Claw", type = "dragon", damageClass = LearnsetMove.DamageClass.PHYSICAL, power = 80),
            ),
        )
        val model = TeamEditorViewModel(FakeTeamService(), dex, format = Format.Champions)
        model.updateMember(0) { it.copy(species = "garchomp") }
        advanceUntilIdle()

        val memberId = model.uiState.value.members[0].id
        val options = model.movepoolOptions(memberId)

        assertEquals(listOf("Dragon Claw", "Earthquake"), options.map { it.displayName })
        assertEquals("Ground · Physical · 100 power", options.first { it.slug == "earthquake" }.hint)
    }

    @Test
    fun clearingASpeciesClearsItsCachedMovepool() = runTest(mainDispatcherRule.dispatcher) {
        val dex = FakeDexLookupService(learnsetResult = listOf(LearnsetMove(slug = "tackle", displayName = "Tackle")))
        val model = TeamEditorViewModel(FakeTeamService(), dex, format = Format.Champions)
        model.updateMember(0) { it.copy(species = "garchomp") }
        advanceUntilIdle()
        val memberId = model.uiState.value.members[0].id
        assertEquals(1, model.movepoolOptions(memberId).size)

        model.updateMember(0) { it.copy(species = "") }
        advanceUntilIdle()

        assertTrue(model.movepoolOptions(memberId).isEmpty())
    }

    // -------------------------------------------------------------------
    // Mega required-item auto-force: forward-only, idempotent, never clears
    // -------------------------------------------------------------------

    @Test
    fun fillingAMegaSpeciesForcesItsRequiredItemIntoTheHeldItemField() = runTest(mainDispatcherRule.dispatcher) {
        val dex = FakeDexLookupService(spritesResult = mapOf("charizard-mega-x" to spriteRef("Charizard-Mega-X", requiredItem = "charizardite-x")))
        val model = TeamEditorViewModel(FakeTeamService(), dex, format = Format.Champions)

        model.updateMember(0) { it.copy(species = "charizard-mega-x") }
        advanceUntilIdle()

        assertEquals("charizardite-x", model.uiState.value.members[0].item)
    }

    @Test
    fun theAutoForceIsIdempotentOnARepeatedSpritesRefresh() = runTest(mainDispatcherRule.dispatcher) {
        val dex = FakeDexLookupService(spritesResult = mapOf("charizard-mega-x" to spriteRef("Charizard-Mega-X", requiredItem = "charizardite-x")))
        val model = TeamEditorViewModel(FakeTeamService(), dex, format = Format.Champions)
        model.updateMember(0) { it.copy(species = "charizard-mega-x") }
        advanceUntilIdle()

        // A second, redundant refresh must not toggle/duplicate anything.
        model.refreshSprites()
        advanceUntilIdle()

        assertEquals("charizardite-x", model.uiState.value.members[0].item)
    }

    @Test
    fun theAutoForceNeverClearsAUserSetItemOnANonMegaSpecies() = runTest(mainDispatcherRule.dispatcher) {
        val dex = FakeDexLookupService(spritesResult = mapOf("garchomp" to spriteRef("Garchomp", requiredItem = null)))
        val model = TeamEditorViewModel(FakeTeamService(), dex, format = Format.Champions)
        model.updateMember(0) { it.copy(species = "garchomp", item = "focus-sash") }
        advanceUntilIdle()

        assertEquals("focus-sash", model.uiState.value.members[0].item)
    }

    // -------------------------------------------------------------------
    // Save — warn-but-allow (never blocked)
    // -------------------------------------------------------------------

    @Test
    fun saveAlwaysIssuesTheRequestEvenWhenWarningsWouldExist() = runTest(mainDispatcherRule.dispatcher) {
        val saved = fakeTeam(id = "t1").copy(members = listOf(member("garchomp")))
        val warnings = listOf(
            ai.gowtam.oak.wire.TeamWarning(code = ai.gowtam.oak.wire.TeamWarning.Code.EvTotalExceeded, message = "EVs over budget", slot = 0),
        )
        val service = FakeTeamService(teamResult = saved to warnings)
        val model = TeamEditorViewModel(service, format = Format.Champions)
        model.updateMember(0) { it.copy(species = "garchomp", evs = StatSpread(252, 252, 252, 252, 252, 252)) }
        advanceUntilIdle()

        model.save()
        advanceUntilIdle()

        // The save call went out regardless of the (deliberately illegal) EV spread.
        assertEquals(1, service.createCalls.size)
        assertEquals(1, model.uiState.value.warnings.size)
        assertEquals("t1", model.uiState.value.teamId)
        assertTrue(model.uiState.value.showSaveConfirmation)
        assertNull(model.uiState.value.errorMessage)
    }

    @Test
    fun savingAnExistingTeamCallsUpdateNotCreate() = runTest(mainDispatcherRule.dispatcher) {
        val team = fakeTeam(id = "existing-1")
        val service = FakeTeamService(teamResult = team to emptyList())
        val model = TeamEditorViewModel(service, team = team)

        model.save()
        advanceUntilIdle()

        assertEquals(1, service.updateCalls.size)
        assertTrue(service.createCalls.isEmpty())
        assertEquals("existing-1", service.updateCalls.first().first)
    }

    @Test
    fun saveFailureSurfacesAnErrorAndClearsIsSaving() = runTest(mainDispatcherRule.dispatcher) {
        val service = FakeTeamService(error = OakError.Transport("boom"))
        val model = TeamEditorViewModel(service, format = Format.Champions)

        model.save()
        advanceUntilIdle()

        assertNotNull(model.uiState.value.errorMessage)
        assertFalse(model.uiState.value.isSaving)
        assertFalse(model.uiState.value.showSaveConfirmation)
    }

    // -------------------------------------------------------------------
    // Export
    // -------------------------------------------------------------------

    @Test
    fun exportPasteRoundTripsThroughTheFakeService() = runTest(mainDispatcherRule.dispatcher) {
        val team = fakeTeam(id = "t1")
        val service = FakeTeamService(exportPasteResult = "Garchomp @ Focus Sash\n")
        val model = TeamEditorViewModel(service, team = team)

        model.exportPaste()
        advanceUntilIdle()

        assertEquals("Garchomp @ Focus Sash\n", model.uiState.value.exportedPaste)
        assertEquals(listOf("t1"), service.exportPasteCalls)

        model.consumeExportedPaste()
        assertNull(model.uiState.value.exportedPaste)
    }

    @Test
    fun exportingAnUnsavedTeamSurfacesAHintInsteadOfCallingTheService() = runTest(mainDispatcherRule.dispatcher) {
        val service = FakeTeamService()
        val model = TeamEditorViewModel(service, format = Format.Champions)

        model.exportPaste()
        advanceUntilIdle()

        assertNull(model.uiState.value.exportedPaste)
        assertTrue(service.exportPasteCalls.isEmpty())
        assertNotNull(model.uiState.value.errorMessage)
    }

    // -------------------------------------------------------------------
    // Draft snapshot / patch application (the assistant apply/undo bridge)
    // -------------------------------------------------------------------

    @Test
    fun draftSnapshotAndRestoreDraftRoundTripTheNameAndMembers() = runTest(mainDispatcherRule.dispatcher) {
        val model = TeamEditorViewModel(FakeTeamService(), format = Format.Champions)
        model.setName("Original")
        model.updateMember(0) { it.copy(species = "garchomp") }
        advanceUntilIdle()
        val snapshot = model.draftSnapshot()

        model.setName("Changed")
        model.updateMember(0) { it.copy(species = "landorus") }
        advanceUntilIdle()

        model.restoreDraft(snapshot)
        advanceUntilIdle()

        assertEquals("Original", model.uiState.value.name)
        assertEquals("garchomp", model.uiState.value.members[0].species)
    }

    // -------------------------------------------------------------------
    // Team analysis (debounce / empty-draft / error-retention / staleness)
    // -------------------------------------------------------------------

    private fun advanceTimeBy(ms: Long) = mainDispatcherRule.dispatcher.scheduler.advanceTimeBy(ms)
    private fun runCurrent() = mainDispatcherRule.dispatcher.scheduler.runCurrent()

    private fun okAnalysis(format: Format = Format.Champions, uncovered: List<String> = emptyList()) =
        TeamAnalysisOk(
            format = format,
            members = emptyList(),
            defense = listOf(DefenseRow(type = "ice", weak = listOf("garchomp"))),
            offense = Offense(uncovered = uncovered),
            speedTiers = emptyList(),
            notes = listOf("Coverage is type-based only."),
        )

    private fun teamWithGarchomp() = fakeTeam(id = "t1").copy(members = listOf(member("garchomp")))

    @Test
    fun scheduleAnalysisCoalescesRapidEditsIntoOneRequest() = runTest(mainDispatcherRule.dispatcher) {
        val service = FakeTeamService(analyzeResult = TeamAnalysis.Ok(okAnalysis()))
        val model = TeamEditorViewModel(service, team = teamWithGarchomp())

        // Three schedules inside the debounce window — each cancels the last timer.
        model.scheduleAnalysis()
        model.scheduleAnalysis()
        model.scheduleAnalysis()
        advanceUntilIdle()

        assertEquals(1, service.analyzeCalls.size)
        assertEquals(Format.Champions, service.analyzeCalls.single().first)
        assertTrue(model.uiState.value.analysis is TeamAnalysis.Ok)
    }

    @Test
    fun scheduleAnalysisIsANoOpForADraftWithNoSpecies() = runTest(mainDispatcherRule.dispatcher) {
        val service = FakeTeamService(analyzeResult = TeamAnalysis.Ok(okAnalysis()))
        val model = TeamEditorViewModel(service, format = Format.Champions) // one empty slot

        model.scheduleAnalysis()
        advanceUntilIdle()

        assertTrue(service.analyzeCalls.isEmpty())
        assertNull(model.uiState.value.analysis)
        assertFalse(model.uiState.value.isAnalyzing)
    }

    @Test
    fun aFailedAnalysisRetainsTheLastGoodResultAndSetsAnError() = runTest(mainDispatcherRule.dispatcher) {
        val good = TeamAnalysis.Ok(okAnalysis())
        val service = FakeTeamService(
            analyzeScript = ArrayDeque(listOf(AnalyzeStep(result = good), AnalyzeStep(error = OakError.Transport("boom")))),
        )
        val model = TeamEditorViewModel(service, team = teamWithGarchomp())

        model.scheduleAnalysis()
        advanceUntilIdle()
        assertEquals(good, model.uiState.value.analysis)
        assertNull(model.uiState.value.analysisError)

        model.scheduleAnalysis() // second request fails
        advanceUntilIdle()

        assertEquals(good, model.uiState.value.analysis) // last good retained
        assertNotNull(model.uiState.value.analysisError)
        assertFalse(model.uiState.value.isAnalyzing)
    }

    @Test
    fun aStaleAnalysisResponseIsDiscardedInFavourOfTheNewerGeneration() = runTest(mainDispatcherRule.dispatcher) {
        val gateOld = CompletableDeferred<Unit>()
        val gateNew = CompletableDeferred<Unit>()
        val resultOld = TeamAnalysis.Ok(okAnalysis(uncovered = listOf("water")))
        val resultNew = TeamAnalysis.Ok(okAnalysis(uncovered = listOf("fire")))
        val service = FakeTeamService(
            analyzeScript = ArrayDeque(
                listOf(
                    AnalyzeStep(result = resultOld, gate = gateOld),
                    AnalyzeStep(result = resultNew, gate = gateNew),
                ),
            ),
        )
        val model = TeamEditorViewModel(service, team = teamWithGarchomp())

        model.scheduleAnalysis() // generation 1
        advanceTimeBy(800); runCurrent() // gen-1 request issued, now blocked on gateOld
        model.scheduleAnalysis() // generation 2
        advanceTimeBy(800); runCurrent() // gen-2 request issued, blocked on gateNew

        // Resolve the OLDER request first — it must NOT overwrite state (superseded).
        gateOld.complete(Unit)
        runCurrent()
        // Then the newer one settles and wins.
        gateNew.complete(Unit)
        runCurrent()

        assertEquals(2, service.analyzeCalls.size)
        assertEquals(resultNew, model.uiState.value.analysis)
        assertNull(model.uiState.value.analysisError)
    }
}
