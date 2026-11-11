# Bugfix Requirements Document

## Introduction

Ten bugfix dotyczy systemu eventów w wtyczce NodeLogic Graph Builder. Obecnie event node (np. `event-element`, `event-id`) nie reaguje prawidłowo na wielokrotne połączenia - po pierwszym użyciu przez jakiś trigger, pozostałe połączone triggery są ignorowane. Problem został zidentyfikowany podczas pracy nad website estimator calculator i stanowi fundamentalne ograniczenie w budowaniu bardziej złożonych grafów logiki, gdzie jeden event powinien móc uruchamiać wiele różnych ścieżek wykonania.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN jeden event node jest połączony z wieloma różnymi triggerami lub ścieżkami wykonania THEN system wykonuje tylko pierwszy trigger na swojej drodze i ignoruje pozostałe połączenia

1.2 WHEN event zostanie użyty przez pierwszy trigger w grafie THEN event "wygasa" i nie uruchamia kolejnych podłączonych triggerów w tej samej iteracji przetwarzania

1.3 WHEN użytkownik buduje graf z relacją 1 event → wielu triggerów THEN tylko jeden trigger działa, co ogranicza możliwości budowania złożonych grafów logiki

### Expected Behavior (Correct)

2.1 WHEN jeden event node jest połączony z wieloma różnymi triggerami lub ścieżkami wykonania THEN system SHALL uruchomić wszystkie podłączone triggery w ramach jednej iteracji przetwarzania eventu

2.2 WHEN event zostaje wywołany (np. kliknięcie przycisku) THEN system SHALL przekazać informację o tym evencie do wszystkich podłączonych węzłów bez "wygasania" po pierwszym użyciu

2.3 WHEN użytkownik buduje graf z relacją 1 event → wielu triggerów THEN system SHALL umożliwić wykonanie wszystkich triggerów podłączonych do tego samego eventu

### Unchanged Behavior (Regression Prevention)

3.1 WHEN event node jest połączony z pojedynczym triggerem THEN system SHALL CONTINUE TO wykonywać ten trigger prawidłowo jak dotychczas

3.2 WHEN event jest wywoływany wielokrotnie w czasie (np. kolejne kliknięcia) THEN system SHALL CONTINUE TO zliczać każde wywołanie poprzez `triggeredCount` i uruchamiać rekalkoulację dla każdego wywołania

3.3 WHEN różne eventy (różne przyciski, różne typy eventów) działają niezależnie THEN system SHALL CONTINUE TO obsługiwać każdy event w izolacji bez wzajemnego wpływu

3.4 WHEN event listener jest rejestrowany przez `__nodeEvent` THEN system SHALL CONTINUE TO rejestrować listener tylko raz dla danego elementu i typu eventu, aby uniknąć duplikacji listenerów
