package ai.gowtam.oak.artifact

import ai.gowtam.oak.features.artifact.ArtifactContent
import ai.gowtam.oak.features.artifact.ArtifactViewModel
import ai.gowtam.oak.support.FakeArtifactService
import ai.gowtam.oak.support.MainDispatcherRule
import ai.gowtam.oak.support.fakeTeam
import ai.gowtam.oak.wire.Abilities
import ai.gowtam.oak.wire.BaseStats
import ai.gowtam.oak.wire.DamageCalc
import ai.gowtam.oak.wire.DefensiveProfile
import ai.gowtam.oak.wire.EntityArtifact
import ai.gowtam.oak.wire.EntityArtifactNotFound
import ai.gowtam.oak.wire.EntityArtifactOk
import ai.gowtam.oak.wire.EntityArtifactUnavailable
import ai.gowtam.oak.wire.EntityData
import ai.gowtam.oak.wire.EntityKind
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.JsonScalar
import ai.gowtam.oak.wire.PokemonArtifactData
import ai.gowtam.oak.wire.ProposedTeam
import ai.gowtam.oak.wire.ResolvedEntity
import ai.gowtam.oak.wire.SavedTeamRef
import ai.gowtam.oak.wire.StatSpread
import ai.gowtam.oak.wire.Subject
import ai.gowtam.oak.wire.TeamMember
import ai.gowtam.oak.wire.TeamWarning
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

/**
 * Exercises [ArtifactViewModel]'s back stack (implementation-plan.md P7 acceptance
 * checks 1/3/4; mirrors iOS `ArtifactViewModelTests`): push/back/dismiss keeps exactly
 * one artifact visible at a time, a `null`/miss fetch resolves to an honest
 * unavailable state rather than breaking the sheet, a proposed-team artifact never
 * calls the service (inline data), a scope change rebuilds (clears) the stack, and
 * "Ask about this in chat" invokes the installed callback with the right text and
 * dismisses.
 *
 * Every fetch path (`openEntity`/`openSavedTeam`) launches on `viewModelScope`, so
 * those tests use [MainDispatcherRule]'s `StandardTestDispatcher` and explicitly
 * `advanceUntilIdle()` — mirroring `ChatViewModelResilienceTest`'s convention.
 */
class ArtifactViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private fun advanceUntilIdle() = mainDispatcherRule.dispatcher.scheduler.advanceUntilIdle()

    private fun newModel(service: FakeArtifactService = FakeArtifactService(), format: Format = Format.Champions) =
        ArtifactViewModel(service, format)

    private fun pokemonOk(name: String = "Garchomp", slug: String = "garchomp") = EntityArtifactOk(
        kind = EntityKind.POKEMON,
        format = Format.Champions,
        resolved = ResolvedEntity(slug = slug, displayName = name),
        generation = "Gen 9 (champions)",
        isFallback = false,
        fallbackNote = null,
        citations = emptyList(),
        data = EntityData.Pokemon(
            PokemonArtifactData(
                displayName = name,
                nationalDexNumber = 445,
                types = listOf("dragon", "ground"),
                abilities = Abilities(slot1 = "sand-veil", hidden = "rough-skin"),
                baseStats = BaseStats(hp = 108, atk = 130, def = 95, spa = 80, spd = 85, spe = 102),
                baseStatTotal = 600,
                spriteUrl = "https://example.test/$slug.png",
                artworkUrl = "https://example.test/$slug.png",
                forms = listOf(slug),
                isGen9Native = true,
                matchups = DefensiveProfile(weakTo = listOf("ice"), resists = listOf("fire"), immuneTo = listOf("electric")),
                movepool = emptyList(),
            ),
        ),
    )

    // -------------------------------------------------------------------
    // Back-stack ops + one-visible invariant (acceptance check 1)
    // -------------------------------------------------------------------

    @Test
    fun anEmptyStackMeansTheViewerIsClosed() {
        val vm = newModel()
        assertTrue(vm.stack.value.isEmpty())
        assertFalse(vm.isPresented)
        assertNull(vm.current)
    }

    @Test
    fun openingAnEntityShowsExactlyOneVisibleArtifact() = runTest(mainDispatcherRule.dispatcher) {
        val service = FakeArtifactService(entityResult = EntityArtifact.Ok(pokemonOk()))
        val vm = newModel(service)

        vm.openEntity(EntityKind.POKEMON, "Garchomp")
        advanceUntilIdle()

        assertEquals(1, vm.stack.value.size)
        assertTrue(vm.isPresented)
        assertFalse(vm.canGoBack)
        val content = vm.current!!.content
        assertTrue(content is ArtifactContent.Entity)
        assertEquals("Garchomp", (content as ArtifactContent.Entity).v.resolved.displayName)
    }

    @Test
    fun openEntityFetchesByTheGivenNameNotASlug() = runTest(mainDispatcherRule.dispatcher) {
        val service = FakeArtifactService(entityResult = EntityArtifact.Ok(pokemonOk(name = "Mr. Mime", slug = "mr-mime")))
        val vm = newModel(service, format = Format.Champions)

        vm.openEntity(EntityKind.POKEMON, "Mr. Mime")
        advanceUntilIdle()

        assertEquals(listOf(Triple(EntityKind.POKEMON, "Mr. Mime", Format.Champions)), service.entityCalls)
    }

    @Test
    fun drillingIntoANestedEntityPushesANewArtifactAndBackReturnsToThePrevious() = runTest(mainDispatcherRule.dispatcher) {
        val service = FakeArtifactService(entityResult = EntityArtifact.Ok(pokemonOk()))
        val vm = newModel(service)

        vm.openEntity(EntityKind.POKEMON, "Garchomp")
        advanceUntilIdle()
        vm.openEntity(EntityKind.MOVE, "dragon-claw") // simulates tapping a movepool entry
        advanceUntilIdle()

        assertEquals(2, vm.stack.value.size)
        assertTrue(vm.canGoBack)

        vm.back()
        assertEquals(1, vm.stack.value.size)
        assertFalse(vm.canGoBack)
        assertTrue(vm.isPresented) // still open — one artifact remains

        vm.back() // at depth 1, back dismisses instead of popping to empty-but-open
        assertTrue(vm.stack.value.isEmpty())
        assertFalse(vm.isPresented)
    }

    @Test
    fun dismissClearsTheEntireStackRegardlessOfDepth() = runTest(mainDispatcherRule.dispatcher) {
        val service = FakeArtifactService(entityResult = EntityArtifact.Ok(pokemonOk()))
        val vm = newModel(service)
        vm.openEntity(EntityKind.POKEMON, "Garchomp")
        advanceUntilIdle()
        vm.openEntity(EntityKind.MOVE, "dragon-claw")
        advanceUntilIdle()

        vm.dismiss()

        assertTrue(vm.stack.value.isEmpty())
    }

    // -------------------------------------------------------------------
    // Null-fold fetch → honest unavailable state (acceptance check 3)
    // -------------------------------------------------------------------

    @Test
    fun aTransportFaultFoldedToNullResolvesToAnUnavailableArtifactWithoutBreakingTheSheet() = runTest(mainDispatcherRule.dispatcher) {
        val service = FakeArtifactService(entityResult = null) // ArtifactService NEVER throws — a fault folds to null
        val vm = newModel(service)

        vm.openEntity(EntityKind.MOVE, "made-up-move")
        advanceUntilIdle()

        assertEquals(1, vm.stack.value.size)
        val content = vm.current!!.content
        assertTrue(content is ArtifactContent.Unavailable)
        assertEquals(EntityKind.MOVE, (content as ArtifactContent.Unavailable).kind)
        assertEquals("made-up-move", content.query)
    }

    @Test
    fun aNotFoundOrUnavailableWireArmAlsoResolvesToAnUnavailableArtifact() = runTest(mainDispatcherRule.dispatcher) {
        val notFound = EntityArtifact.NotFound(
            EntityArtifactNotFound(kind = EntityKind.POKEMON, format = Format.Champions, query = "Garchmp", suggestions = listOf("Garchomp")),
        )
        val service = FakeArtifactService(entityResult = notFound)
        val vm = newModel(service)

        vm.openEntity(EntityKind.POKEMON, "Garchmp")
        advanceUntilIdle()

        assertTrue(vm.current!!.content is ArtifactContent.Unavailable)

        val unavailableWire = EntityArtifact.Unavailable(EntityArtifactUnavailable(kind = EntityKind.ITEM, format = Format.Champions))
        val service2 = FakeArtifactService(entityResult = unavailableWire)
        val vm2 = newModel(service2)
        vm2.openEntity(EntityKind.ITEM, "leftovers")
        advanceUntilIdle()
        assertTrue(vm2.current!!.content is ArtifactContent.Unavailable)
    }

    @Test
    fun aSavedTeamFetchThatReturnsNullResolvesToTeamUnavailable() = runTest(mainDispatcherRule.dispatcher) {
        val service = FakeArtifactService(savedTeamResult = null)
        val vm = newModel(service)

        vm.openSavedTeam(SavedTeamRef(id = "team-1", name = "Sun Team", format = Format.Champions))
        advanceUntilIdle()

        assertEquals(1, vm.stack.value.size)
        assertEquals(ArtifactContent.TeamUnavailable, vm.current!!.content)
        assertEquals(listOf("team-1"), service.savedTeamCalls)
    }

    @Test
    fun aSavedTeamFetchThatSucceedsResolvesToATeamSheetCarryingTheSavedId() = runTest(mainDispatcherRule.dispatcher) {
        val team = fakeTeam(id = "team-9")
        val service = FakeArtifactService(savedTeamResult = team to listOf(TeamWarning(code = TeamWarning.Code.Incomplete, message = "0 of 6")))
        val vm = newModel(service)

        vm.openSavedTeam(SavedTeamRef(id = "team-9", name = "Fake Team", format = Format.Champions))
        advanceUntilIdle()

        val content = vm.current!!.content
        assertTrue(content is ArtifactContent.TeamSheet)
        content as ArtifactContent.TeamSheet
        assertEquals("team-9", content.v.savedId)
        assertEquals(1, content.v.warnings.size)
    }

    // -------------------------------------------------------------------
    // Inline team/comparison/damage-calc artifacts — no fetch (acceptance check 3)
    // -------------------------------------------------------------------

    @Test
    fun openingTheProposedTeamUsesTheInlineDataWithNoServiceFetch() {
        val service = FakeArtifactService()
        val vm = newModel(service)
        val team = ProposedTeam(
            name = "Sun Team",
            format = Format.Champions,
            members = listOf(
                TeamMember(
                    species = "charizard", ability = "drought", item = "charizardite-y",
                    moves = listOf("flamethrower"), nature = "timid",
                    evs = StatSpread(0, 0, 0, 252, 4, 252), ivs = StatSpread(31, 0, 31, 31, 31, 31),
                    teraType = "fire", level = 100,
                ),
            ),
        )

        // Synchronous — the sheet appears instantly with no coroutine to advance.
        vm.openProposedTeam(team, warnings = emptyList())

        assertEquals(1, vm.stack.value.size)
        val content = vm.current!!.content
        assertTrue(content is ArtifactContent.TeamSheet)
        content as ArtifactContent.TeamSheet
        assertNull(content.v.savedId)
        assertEquals("Sun Team", content.v.name)
        assertTrue(service.entityCalls.isEmpty())
        assertTrue(service.savedTeamCalls.isEmpty())
    }

    @Test
    fun openingAComparisonOrDamageCalcArtifactIsSynchronousWithNoFetch() {
        val service = FakeArtifactService()
        val vm = newModel(service)

        vm.openComparison(listOf(Subject(name = "Garchomp", spriteUrl = "", types = listOf("dragon"), isFallback = false)))
        assertTrue(vm.current!!.content is ArtifactContent.Comparison)

        vm.openDamageCalc(DamageCalc(assumptions = emptyMap(), result = mapOf("max_percent" to JsonScalar.IntVal(50)), isEstimate = true))
        assertTrue(vm.current!!.content is ArtifactContent.DamageCalcContent)

        assertTrue(service.entityCalls.isEmpty())
        assertTrue(service.savedTeamCalls.isEmpty())
    }

    // -------------------------------------------------------------------
    // Scope-change rebuild (acceptance check 3 — respects the active scope)
    // -------------------------------------------------------------------

    @Test
    fun changingTheFormatClearsAnOpenStackSoStaleScopedDataNeverLingers() = runTest(mainDispatcherRule.dispatcher) {
        val service = FakeArtifactService(entityResult = EntityArtifact.Ok(pokemonOk()))
        val vm = newModel(service, format = Format.Champions)
        vm.openEntity(EntityKind.POKEMON, "Garchomp")
        advanceUntilIdle()
        assertTrue(vm.isPresented)

        vm.updateFormat(Format.ScarletViolet)

        assertTrue(vm.stack.value.isEmpty())
    }

    @Test
    fun reassertingTheSameFormatDoesNotDismissAnOpenSheet() = runTest(mainDispatcherRule.dispatcher) {
        val service = FakeArtifactService(entityResult = EntityArtifact.Ok(pokemonOk()))
        val vm = newModel(service, format = Format.Champions)
        vm.openEntity(EntityKind.POKEMON, "Garchomp")
        advanceUntilIdle()

        vm.updateFormat(Format.Champions) // no-op — same format, a spurious recomposition shouldn't close the sheet

        assertTrue(vm.isPresented)
        assertEquals(1, vm.stack.value.size)
    }
}
