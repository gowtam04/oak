package ai.gowtam.oak.teams

import ai.gowtam.oak.features.teams.TeamEditorViewModel
import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.support.FakeDexLookupService
import ai.gowtam.oak.support.FakeTeamService
import ai.gowtam.oak.support.MainDispatcherRule
import ai.gowtam.oak.support.fakeTeam
import ai.gowtam.oak.wire.BaseStats
import ai.gowtam.oak.wire.DexSpriteRef
import ai.gowtam.oak.wire.EntityKind
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.LearnsetMove
import ai.gowtam.oak.wire.SearchMatch
import ai.gowtam.oak.wire.StatSpread
import ai.gowtam.oak.wire.TeamMember
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
        assertEquals(Triple(EntityKind.POKEMON, "garch", Format.Gen5), dex.searchCalls.single())
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
}
